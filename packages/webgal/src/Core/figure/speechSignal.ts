export const SPEECH_FRAME_MS = 50;

export interface SpeechSignal {
  sample: (elapsedMs?: number) => number;
}

export type BitmapMouthState = 'closed' | 'half_open' | 'open';

export interface IQuantizedMouthOpenness {
  openness: 0 | 0.5 | 1;
  state: BitmapMouthState;
}

/**
 * Three-frame bitmap mouth selection with hysteresis and an enforced half-open
 * transition between the two extremes.
 */
export function quantizeMouthOpenness(value: number, previousState: BitmapMouthState): IQuantizedMouthOpenness {
  const openness = clamp01(value);
  let targetState: BitmapMouthState;
  if (previousState === 'closed') {
    targetState = openness >= 0.35 ? (openness >= 0.72 ? 'open' : 'half_open') : 'closed';
  } else if (previousState === 'open') {
    targetState = openness <= 0.28 ? 'closed' : openness <= 0.62 ? 'half_open' : 'open';
  } else {
    targetState = openness >= 0.68 ? 'open' : openness <= 0.32 ? 'closed' : 'half_open';
  }

  if (previousState === 'closed' && targetState === 'open') {
    targetState = 'half_open';
  } else if (previousState === 'open' && targetState === 'closed') {
    targetState = 'half_open';
  }

  return {
    state: targetState,
    openness: targetState === 'closed' ? 0 : targetState === 'half_open' ? 0.5 : 1,
  };
}

export function createAudioElementSpeechSignal(
  media: Pick<HTMLMediaElement, 'currentTime'>,
  samples: readonly number[],
  frameMs = SPEECH_FRAME_MS,
): SpeechSignal {
  return {
    sample: () => {
      const sampleIndex = Math.floor((media.currentTime * 1000) / frameMs);
      return sampleIndex >= 0 && sampleIndex < samples.length ? clamp01(samples[sampleIndex]) : 0;
    },
  };
}

/**
 * Provides a deterministic mouth cadence while the decoded PCM envelope is
 * unavailable. It deliberately follows the media timeline, so seeking and
 * playback-rate changes cannot desynchronise the temporary pose sequence.
 */
export function createAudioTimelineFallbackSignal(
  media: Pick<HTMLMediaElement, 'currentTime'>,
  frameMs = SPEECH_FRAME_MS,
): SpeechSignal {
  const safeFrameMs = Number.isFinite(frameMs) && frameMs > 0 ? frameMs : SPEECH_FRAME_MS;
  const cadence = [0.5, 1, 0.5, 0, 0.5, 1, 0.5, 0] as const;
  return {
    sample: () => {
      const currentTimeMs = Number.isFinite(media.currentTime) ? Math.max(0, media.currentTime * 1000) : 0;
      const frame = Math.floor(currentTimeMs / safeFrameMs);
      return cadence[frame % cadence.length];
    },
  };
}

export function createTextSpeechSignal(text: string, durationMs: number): SpeechSignal {
  const characters = Array.from(text);
  const safeDuration = Number.isFinite(durationMs) ? Math.max(durationMs, 1) : 1;
  return {
    sample: (elapsedMs = 0) => {
      if (characters.length === 0 || elapsedMs < 0 || elapsedMs >= safeDuration) return 0;
      if (elapsedMs === 0) return isPunctuation(characters[0]) ? 0 : 0.5;
      const characterIndex = Math.min(
        characters.length - 1,
        Math.max(0, Math.ceil((elapsedMs / safeDuration) * characters.length) - 1),
      );
      if (isPunctuation(characters[characterIndex])) return 0;
      const frame = Math.floor(elapsedMs / SPEECH_FRAME_MS);
      return [0.5, 1, 0.5, 0.5][frame % 4];
    },
  };
}

export function buildPcmSpeechSamples(
  channels: readonly Float32Array[],
  sampleRate: number,
  frameMs = SPEECH_FRAME_MS,
): number[] {
  const sampleCount = channels.reduce((largest, channel) => Math.max(largest, channel.length), 0);
  if (sampleCount === 0 || sampleRate <= 0) return [];
  const samplesPerFrame = Math.max(1, Math.floor((sampleRate * frameMs) / 1000));
  const frameCount = Math.ceil(sampleCount / samplesPerFrame);
  const peaks = new Array<number>(frameCount).fill(0);

  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * samplesPerFrame;
    const end = Math.min(sampleCount, start + samplesPerFrame);
    let peak = 0;
    for (const channel of channels) {
      for (let sampleIndex = start; sampleIndex < end && sampleIndex < channel.length; sampleIndex++) {
        peak = Math.max(peak, Math.abs(channel[sampleIndex]));
      }
    }
    peaks[frame] = peak;
  }

  const sortedPeaks = peaks.filter((peak) => peak > 0).sort((left, right) => left - right);
  if (sortedPeaks.length === 0) return peaks;
  const referencePeak = sortedPeaks[Math.min(sortedPeaks.length - 1, Math.floor(sortedPeaks.length * 0.95))];
  const noiseFloor = Math.min(0.02, referencePeak * 0.08);
  const usableRange = Math.max(referencePeak - noiseFloor, 0.0001);
  let previous = 0;
  const normalized = peaks.map((peak) => {
    const target = clamp01((peak - noiseFloor) / usableRange);
    const smoothing = target > previous ? 0.72 : 0.48;
    previous += (target - previous) * smoothing;
    return previous;
  });

  // A sentence always starts and ends closed, independent of clipping in the
  // source file. The bitmap adapter then opens through its half frame.
  normalized[0] = 0;
  normalized[normalized.length - 1] = 0;
  return normalized;
}

export async function prepareAudioSpeechSignal(media: HTMLMediaElement, signal?: AbortSignal): Promise<SpeechSignal> {
  const sourceUrl = media.currentSrc || media.src;
  if (!sourceUrl) throw new Error('语音元素没有可分析的资源地址');
  const response = await fetch(sourceUrl, { signal });
  if (!response.ok) throw new Error(`语音分析资源请求失败：${response.status}`);
  const encodedAudio = await response.arrayBuffer();
  if (signal?.aborted) throw createAbortError();
  const audioContext = getAudioDecodeContext();
  const audioBuffer = await audioContext.decodeAudioData(encodedAudio.slice(0));
  if (signal?.aborted) throw createAbortError();
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index),
  );
  return createAudioElementSpeechSignal(media, buildPcmSpeechSamples(channels, audioBuffer.sampleRate));
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 1));
}

let audioDecodeContext: AudioContext | undefined;

function getAudioDecodeContext(): AudioContext {
  if (audioDecodeContext) return audioDecodeContext;
  const AudioContextCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('当前环境不支持 Web Audio 解码');
  audioDecodeContext = new AudioContextCtor();
  return audioDecodeContext;
}

function createAbortError(): Error {
  const error = new Error('语音分析已取消');
  error.name = 'AbortError';
  return error;
}

function isPunctuation(character: string): boolean {
  return /[\s，。！？、；：,.!?;:…—]/u.test(character);
}
