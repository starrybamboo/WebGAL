import { describe, expect, test } from 'vitest';
import {
  buildPcmSpeechSamples,
  createAudioElementSpeechSignal,
  createAudioTimelineFallbackSignal,
  createTextSpeechSignal,
  quantizeMouthOpenness,
} from './speechSignal';

describe('speech signals', () => {
  test('uses media currentTime as the only audio timeline clock', () => {
    const media = { currentTime: 0 } as HTMLMediaElement;
    const signal = createAudioElementSpeechSignal(media, [0, 0.2, 0.9, 0.1]);

    media.currentTime = 0.11;
    expect(signal.sample()).toBeCloseTo(0.9);
    media.currentTime = 0.01;
    expect(signal.sample()).toBe(0);
    media.currentTime = 9;
    expect(signal.sample()).toBe(0);
  });

  test('uses a deterministic media-timeline cadence while PCM analysis is unavailable', () => {
    const media = { currentTime: 0 } as HTMLMediaElement;
    const signal = createAudioTimelineFallbackSignal(media);

    expect(signal.sample(999)).toBe(0.5);
    media.currentTime = 0.051;
    expect(signal.sample(0)).toBe(1);
    media.currentTime = 0.151;
    expect(signal.sample()).toBe(0);
    media.currentTime = 0;
    expect(signal.sample()).toBe(0.5);
  });

  test('keeps bitmap transitions on the half-open state between closed and open', () => {
    expect(quantizeMouthOpenness(0, 'closed')).toEqual({ openness: 0, state: 'closed' });
    expect(quantizeMouthOpenness(1, 'closed')).toEqual({ openness: 0.5, state: 'half_open' });
    expect(quantizeMouthOpenness(1, 'half_open')).toEqual({ openness: 1, state: 'open' });
    expect(quantizeMouthOpenness(0, 'open')).toEqual({ openness: 0.5, state: 'half_open' });
  });

  test('creates deterministic text speech with closed endpoints and punctuation rests', () => {
    const signal = createTextSpeechSignal('你好，世界。', 1000);

    expect(signal.sample(0)).toBe(0.5);
    expect(signal.sample(1000)).toBe(0);
    expect(signal.sample(100)).toBeGreaterThan(0);
    expect(signal.sample(500)).toBe(0);
  });

  test.each([3, 30, 50])('opens immediately and closes at the end of a %dms text signal', (durationMs) => {
    const signal = createTextSpeechSignal('短', durationMs);

    expect(signal.sample(0)).toBeGreaterThanOrEqual(0.5);
    expect(signal.sample(durationMs)).toBe(0);
  });

  test('keeps punctuation-only text closed from its first frame', () => {
    expect(createTextSpeechSignal('。', 30).sample(0)).toBe(0);
  });

  test('normalizes PCM into a smoothed envelope with closed edge frames', () => {
    const samples = buildPcmSpeechSamples([new Float32Array([1, 1, 1, 1])], 10, 100);

    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(0);
    expect(samples[1]).toBeGreaterThan(0.5);
  });
});
