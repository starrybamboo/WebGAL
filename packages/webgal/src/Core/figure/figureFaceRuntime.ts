import {
  clamp01,
  createAudioTimelineFallbackSignal,
  createTextSpeechSignal,
  prepareAudioSpeechSignal,
  type SpeechSignal,
} from './speechSignal';

export type ReleaseFigureFace = () => void;

export interface FacePose {
  eyeOpen?: number;
  mouthOpen?: number;
}

export interface FaceChannels {
  eyes: boolean;
  mouth: boolean;
}

export interface FaceAdapter {
  readonly channels: FaceChannels;
  present: (pose: FacePose) => void;
  release: () => void;
}

const BITMAP_BLINK_TIMING = {
  intervalMs: 1800,
  intervalRandomMs: 2200,
  closingMs: 60,
  closedMs: 90,
  openingMs: 75,
};

export type SpeechSource =
  | { kind: 'audio'; media: HTMLMediaElement }
  | { kind: 'text'; text: string; durationMs: number };

export interface FigureFaceRuntimeDependencies {
  now?: () => number;
  random?: () => number;
  schedule?: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
  prepareAudio?: (media: HTMLMediaElement, signal?: AbortSignal) => Promise<SpeechSignal>;
  reportError?: (message: string, error: unknown) => void;
}

interface SpeechLease {
  token: number;
  signal: SpeechSignal;
  startedAt: number;
  abortController?: AbortController;
}

type BlinkPhase = 'waiting' | 'closing' | 'closed' | 'opening';

interface AttachedFace {
  token: number;
  adapter: FaceAdapter;
  channels: FaceChannels;
  blinkPhase: BlinkPhase;
  blinkDeadline: number;
  presentationFailed: boolean;
}

const SPEECH_REFRESH_MS = 50;

/**
 * Owns all transient Figure face lifecycles. Callers attach a render adapter and
 * acquire a token-scoped speech lease; blink and speech timing remain internal.
 */
export class FigureFaceRuntime {
  private readonly faces = new Map<string, AttachedFace>();
  private readonly speeches = new Map<string, SpeechLease>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly schedule: NonNullable<FigureFaceRuntimeDependencies['schedule']>;
  private readonly cancel: NonNullable<FigureFaceRuntimeDependencies['cancel']>;
  private readonly prepareAudio: NonNullable<FigureFaceRuntimeDependencies['prepareAudio']>;
  private readonly reportError: NonNullable<FigureFaceRuntimeDependencies['reportError']>;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextToken = 1;

  public constructor(dependencies: FigureFaceRuntimeDependencies = {}) {
    this.now = dependencies.now ?? (() => Date.now());
    this.random = dependencies.random ?? Math.random;
    this.schedule = dependencies.schedule ?? setTimeout;
    this.cancel = dependencies.cancel ?? clearTimeout;
    this.prepareAudio = dependencies.prepareAudio ?? prepareAudioSpeechSignal;
    this.reportError = dependencies.reportError ?? (() => undefined);
  }

  public attach(target: string, adapter: FaceAdapter): ReleaseFigureFace {
    const token = this.nextToken++;
    const previous = this.faces.get(target);
    if (previous) {
      this.safeRelease(target, previous);
    }
    const channels = adapter.channels;
    const now = this.now();
    const face: AttachedFace = {
      token,
      adapter,
      channels,
      blinkPhase: 'waiting',
      blinkDeadline: Number.POSITIVE_INFINITY,
      presentationFailed: false,
    };
    face.blinkDeadline = channels.eyes ? now + this.nextBlinkInterval() : Number.POSITIVE_INFINITY;
    this.faces.set(target, face);
    this.present(target, face, now);
    this.reschedule();
    return () => {
      const current = this.faces.get(target);
      if (!current || current.token !== token) return;
      this.faces.delete(target);
      this.safeRelease(target, current);
      this.reschedule();
    };
  }

  public speak(target: string, source: SpeechSource | SpeechSignal): ReleaseFigureFace {
    const token = this.nextToken++;
    const previous = this.speeches.get(target);
    previous?.abortController?.abort();
    const startedAt = this.now();
    const lease: SpeechLease = {
      token,
      startedAt,
      signal: makeSpeechSignal(source),
    };
    this.speeches.set(target, lease);
    let audioSource: Extract<SpeechSource, { kind: 'audio' }> | undefined;
    if (!isSpeechSignal(source) && source.kind === 'audio') audioSource = source;

    if (audioSource) {
      const abortController = typeof AbortController === 'undefined' ? undefined : new AbortController();
      lease.abortController = abortController;
      void this.prepareAudio(audioSource.media, abortController?.signal)
        .then((signal) => {
          const current = this.speeches.get(target);
          if (!current || current.token !== token) return;
          current.signal = signal;
          this.refresh(target);
        })
        .catch((error) => {
          const current = this.speeches.get(target);
          if (!current || current.token !== token) return;
          if ((error as { name?: string })?.name !== 'AbortError') {
            this.reportError(`Figure ${target} 的语音口型分析失败，继续使用时间轴降级口型`, error);
            this.refresh(target);
          }
        });
    }

    this.refresh(target);
    this.reschedule();
    return () => {
      const current = this.speeches.get(target);
      if (!current || current.token !== token) return;
      current.abortController?.abort();
      this.speeches.delete(target);
      this.refresh(target);
      // Bitmap mouths deliberately pass through the half-open pose. Submit the
      // terminal pose twice so an explicit stop still closes synchronously.
      this.refresh(target);
      this.reschedule();
    };
  }

  private refresh(target: string): void {
    const face = this.faces.get(target);
    if (face) this.present(target, face, this.now());
  }

  public stopAllSpeech(): void {
    const targets = [...this.speeches.keys()];
    for (const lease of this.speeches.values()) lease.abortController?.abort();
    this.speeches.clear();
    const now = this.now();
    for (const target of targets) {
      const face = this.faces.get(target);
      if (face) {
        this.present(target, face, now);
        this.present(target, face, now);
      }
    }
    this.reschedule();
  }

  public dispose(): void {
    if (this.timer !== undefined) this.cancel(this.timer);
    this.timer = undefined;
    for (const lease of this.speeches.values()) lease.abortController?.abort();
    this.speeches.clear();
    for (const [target, face] of this.faces) this.safeRelease(target, face);
    this.faces.clear();
  }

  private tick = (): void => {
    this.timer = undefined;
    const now = this.now();
    for (const [target, face] of this.faces) {
      this.advanceBlink(face, now);
      this.present(target, face, now);
    }
    this.reschedule();
  };

  private advanceBlink(face: AttachedFace, now: number): void {
    if (!face.channels.eyes) return;
    let transitions = 0;
    while (now >= face.blinkDeadline && transitions++ < 8) {
      switch (face.blinkPhase) {
        case 'waiting':
          face.blinkPhase = 'closing';
          face.blinkDeadline += BITMAP_BLINK_TIMING.closingMs;
          break;
        case 'closing':
          face.blinkPhase = 'closed';
          face.blinkDeadline += BITMAP_BLINK_TIMING.closedMs;
          break;
        case 'closed':
          face.blinkPhase = 'opening';
          face.blinkDeadline += BITMAP_BLINK_TIMING.openingMs;
          break;
        case 'opening':
          face.blinkPhase = 'waiting';
          face.blinkDeadline = now + this.nextBlinkInterval();
          break;
      }
    }
  }

  private present(target: string, face: AttachedFace, now: number): void {
    if (face.presentationFailed) return;
    const speech = this.speeches.get(target);
    const pose: FacePose = {
      eyeOpen: face.channels.eyes ? eyeOpenness(face.blinkPhase) : undefined,
      mouthOpen: face.channels.mouth && speech ? clamp01(speech.signal.sample(now - speech.startedAt)) : undefined,
    };
    try {
      face.adapter.present(pose);
    } catch (error) {
      face.presentationFailed = true;
      this.reportError(`Figure ${target} 的面部姿态提交失败，已隔离该 Figure`, error);
    }
  }

  private reschedule(): void {
    if (this.timer !== undefined) {
      this.cancel(this.timer);
      this.timer = undefined;
    }
    const now = this.now();
    let nextDeadline = Number.POSITIVE_INFINITY;
    for (const [target, face] of this.faces) {
      if (face.channels.eyes) nextDeadline = Math.min(nextDeadline, face.blinkDeadline);
      if (face.channels.mouth && this.speeches.has(target)) {
        nextDeadline = Math.min(nextDeadline, now + SPEECH_REFRESH_MS);
      }
    }
    if (Number.isFinite(nextDeadline)) {
      this.timer = this.schedule(this.tick, Math.max(0, nextDeadline - now));
    }
  }

  private nextBlinkInterval(): number {
    return BITMAP_BLINK_TIMING.intervalMs + this.random() * BITMAP_BLINK_TIMING.intervalRandomMs;
  }

  private safeRelease(target: string, face: AttachedFace): void {
    try {
      face.adapter.release();
    } catch (error) {
      this.reportError(`Figure ${target} 的面部 Adapter 释放失败`, error);
    }
  }
}

function isSpeechSignal(source: SpeechSource | SpeechSignal): source is SpeechSignal {
  return typeof (source as SpeechSignal).sample === 'function';
}

function makeSpeechSignal(source: SpeechSource | SpeechSignal): SpeechSignal {
  if (isSpeechSignal(source)) return source;
  if (source.kind === 'text') return createTextSpeechSignal(source.text, source.durationMs);
  return createAudioTimelineFallbackSignal(source.media);
}

function eyeOpenness(phase: BlinkPhase): number | undefined {
  return phase === 'waiting' ? undefined : phase === 'closed' ? 0 : 0.5;
}
