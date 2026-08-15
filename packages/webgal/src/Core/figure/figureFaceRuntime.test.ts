import { afterEach, describe, expect, test, vi } from 'vitest';
import { FigureFaceRuntime, type FaceAdapter, type FaceChannels, type FacePose } from './figureFaceRuntime';
import type { SpeechSignal } from './speechSignal';

class ObservedFace implements FaceAdapter {
  public readonly poses: FacePose[] = [];
  public released = false;

  public constructor(public readonly channels: FaceChannels = { eyes: false, mouth: true }) {}

  public present(pose: FacePose): void {
    this.poses.push(pose);
  }

  public release(): void {
    this.released = true;
  }
}

const openSpeech: SpeechSignal = {
  sample: () => 1,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('FigureFaceRuntime', () => {
  test('keeps speech started before an asynchronously delivered figure', () => {
    vi.useFakeTimers();
    const runtime = new FigureFaceRuntime({ random: () => 0 });
    const stopSpeech = runtime.speak('hero', openSpeech);
    const face = new ObservedFace();

    runtime.attach('hero', face);

    expect(face.poses.at(-1)).toEqual({ eyeOpen: undefined, mouthOpen: 1 });
    stopSpeech();
    expect(face.poses.at(-1)).toEqual({ eyeOpen: undefined, mouthOpen: undefined });
    runtime.dispose();
  });

  test('does not let a stale speech release close a newer speech lease', () => {
    vi.useFakeTimers();
    const runtime = new FigureFaceRuntime({ random: () => 0 });
    const face = new ObservedFace();
    runtime.attach('hero', face);
    const stopFirst = runtime.speak('hero', { sample: () => 0.5 });
    const stopSecond = runtime.speak('hero', openSpeech);

    stopFirst();
    expect(face.poses.at(-1)?.mouthOpen).toBe(1);

    stopSecond();
    expect(face.poses.at(-1)?.mouthOpen).toBeUndefined();
    runtime.dispose();
  });

  test('replaces a target adapter without allowing stale detach to remove the replacement', () => {
    vi.useFakeTimers();
    const runtime = new FigureFaceRuntime({ random: () => 0 });
    const first = new ObservedFace();
    const second = new ObservedFace();
    const detachFirst = runtime.attach('hero', first);
    runtime.speak('hero', openSpeech);
    runtime.attach('hero', second);

    expect(first.released).toBe(true);
    detachFirst();

    expect(second.released).toBe(false);
    expect(second.poses.at(-1)?.mouthOpen).toBe(1);
    runtime.dispose();
  });

  test('composes an independent blink and mouth signal into one pose', () => {
    vi.useFakeTimers();
    const runtime = new FigureFaceRuntime({ random: () => 0 });
    const face = new ObservedFace({ eyes: true, mouth: true });
    runtime.attach('hero', face);
    runtime.speak('hero', openSpeech);

    vi.advanceTimersByTime(1800);
    expect(face.poses.at(-1)).toEqual({ eyeOpen: 0.5, mouthOpen: 1 });
    vi.advanceTimersByTime(60);
    expect(face.poses.at(-1)).toEqual({ eyeOpen: 0, mouthOpen: 1 });
    vi.advanceTimersByTime(90);
    expect(face.poses.at(-1)).toEqual({ eyeOpen: 0.5, mouthOpen: 1 });
    vi.advanceTimersByTime(75);
    expect(face.poses.at(-1)).toEqual({ eyeOpen: undefined, mouthOpen: 1 });
    runtime.dispose();
  });

  test('releasing speech yields the mouth channel while blink keeps running', () => {
    vi.useFakeTimers();
    const runtime = new FigureFaceRuntime({ random: () => 0 });
    const face = new ObservedFace({ eyes: true, mouth: true });
    runtime.attach('hero', face);
    const stopSpeech = runtime.speak('hero', openSpeech);

    stopSpeech();
    vi.advanceTimersByTime(1800);

    expect(face.poses.at(-1)).toEqual({ eyeOpen: 0.5, mouthOpen: undefined });
    runtime.dispose();
  });

  test('isolates an adapter failure from other targets', () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const runtime = new FigureFaceRuntime({
      random: () => 0,
      reportError: (message) => errors.push(message),
    });
    runtime.attach(
      'broken',
      {
        channels: { eyes: false, mouth: true },
        present: () => {
          throw new Error('broken');
        },
        release: () => undefined,
      },
    );
    const healthy = new ObservedFace();
    runtime.attach('healthy', healthy);

    expect(() => runtime.speak('broken', openSpeech)).not.toThrow();
    runtime.speak('healthy', openSpeech);

    expect(errors).toHaveLength(1);
    expect(healthy.poses.at(-1)?.mouthOpen).toBe(1);
    runtime.dispose();
  });

  test('keeps sampling a steady speech signal on the shared clock', () => {
    vi.useFakeTimers();
    const runtime = new FigureFaceRuntime({ random: () => 0 });
    const face = new ObservedFace();
    runtime.attach('hero', face);
    runtime.speak('hero', { sample: () => 0.5 });
    const presentations = face.poses.length;

    vi.advanceTimersByTime(200);

    expect(face.poses.length).toBeGreaterThan(presentations);
    runtime.dispose();
  });

  test('returns synchronously with a media-timeline fallback while PCM preparation is pending', () => {
    vi.useFakeTimers();
    const prepareAudio = vi.fn(() => new Promise<SpeechSignal>(() => undefined));
    const runtime = new FigureFaceRuntime({ random: () => 0, prepareAudio });
    const face = new ObservedFace();
    const media = { currentTime: 0 } as HTMLMediaElement;
    runtime.attach('hero', face);

    const stopSpeech = runtime.speak('hero', { kind: 'audio', media });

    expect(stopSpeech).toEqual(expect.any(Function));
    expect(prepareAudio).toHaveBeenCalledOnce();
    expect(face.poses.at(-1)?.mouthOpen).toBe(0.5);
    media.currentTime = 0.051;
    vi.advanceTimersByTime(50);
    expect(face.poses.at(-1)?.mouthOpen).toBe(1);
    runtime.dispose();
  });

  test('atomically replaces the pending fallback when PCM preparation completes', async () => {
    vi.useFakeTimers();
    let resolveAnalysis: (signal: SpeechSignal) => void = () => undefined;
    const runtime = new FigureFaceRuntime({
      random: () => 0,
      prepareAudio: () =>
        new Promise<SpeechSignal>((resolve) => {
          resolveAnalysis = resolve;
        }),
    });
    const face = new ObservedFace();
    const media = { currentTime: 0.151 } as HTMLMediaElement;
    runtime.attach('hero', face);
    runtime.speak('hero', { kind: 'audio', media });

    expect(face.poses.at(-1)?.mouthOpen).toBe(0);
    resolveAnalysis(openSpeech);
    await Promise.resolve();

    expect(face.poses.at(-1)?.mouthOpen).toBe(1);
    runtime.dispose();
  });

  test('keeps the media-timeline fallback when PCM preparation fails', async () => {
    vi.useFakeTimers();
    let rejectAnalysis: (reason?: unknown) => void = () => undefined;
    const errors: string[] = [];
    const runtime = new FigureFaceRuntime({
      random: () => 0,
      prepareAudio: () =>
        new Promise<SpeechSignal>((_resolve, reject) => {
          rejectAnalysis = reject;
        }),
      reportError: (message) => errors.push(message),
    });
    const face = new ObservedFace();
    const media = { currentTime: 0 } as HTMLMediaElement;
    runtime.attach('hero', face);
    runtime.speak('hero', { kind: 'audio', media });

    rejectAnalysis(new Error('decode failed'));
    await Promise.resolve();
    await Promise.resolve();
    media.currentTime = 0.051;
    vi.advanceTimersByTime(50);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('继续使用时间轴降级口型');
    expect(face.poses.at(-1)?.mouthOpen).toBe(1);
    runtime.dispose();
  });

  test('does not let a stale PCM result replace the current speech token', async () => {
    vi.useFakeTimers();
    const resolveAnalyses: Array<(signal: SpeechSignal) => void> = [];
    const runtime = new FigureFaceRuntime({
      random: () => 0,
      prepareAudio: () =>
        new Promise<SpeechSignal>((resolve) => {
          resolveAnalyses.push(resolve);
        }),
    });
    const face = new ObservedFace();
    const firstMedia = { currentTime: 0 } as HTMLMediaElement;
    const currentMedia = { currentTime: 0.151 } as HTMLMediaElement;
    runtime.attach('hero', face);
    runtime.speak('hero', { kind: 'audio', media: firstMedia });
    runtime.speak('hero', { kind: 'audio', media: currentMedia });

    resolveAnalyses[0](openSpeech);
    await Promise.resolve();
    expect(face.poses.at(-1)?.mouthOpen).toBe(0);

    resolveAnalyses[1](openSpeech);
    await Promise.resolve();
    expect(face.poses.at(-1)?.mouthOpen).toBe(1);
    runtime.dispose();
  });

  test('ignores an audio analysis result after its speech lease is released', async () => {
    vi.useFakeTimers();
    let resolveAnalysis: ((signal: SpeechSignal) => void) | undefined;
    const runtime = new FigureFaceRuntime({
      random: () => 0,
      prepareAudio: () =>
        new Promise((resolve) => {
          resolveAnalysis = resolve;
        }),
    });
    const face = new ObservedFace();
    runtime.attach('hero', face);
    const stopSpeech = runtime.speak('hero', {
      kind: 'audio',
      media: { currentTime: 0 } as HTMLMediaElement,
    });

    stopSpeech();
    resolveAnalysis?.(openSpeech);
    await Promise.resolve();

    expect(face.poses.at(-1)?.mouthOpen).toBeUndefined();
    runtime.dispose();
  });

  test('dispose cancels the shared timer and releases attached faces', () => {
    vi.useFakeTimers();
    const runtime = new FigureFaceRuntime({ random: () => 0 });
    const face = new ObservedFace({ eyes: true, mouth: true });
    runtime.attach('hero', face);
    runtime.speak('hero', openSpeech);

    runtime.dispose();

    expect(face.released).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
