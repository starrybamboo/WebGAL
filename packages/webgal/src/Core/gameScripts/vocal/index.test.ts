import { afterEach, describe, expect, test, vi } from 'vitest';
import { commandType, type ISentence } from '@/Core/controller/scene/sceneInterface';
import { WebGAL } from '@/Core/WebGAL';
import { playVocal } from './index';

const previousDocument = globalThis.document;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: previousDocument,
  });
});

describe('playVocal face lifecycle', () => {
  test('acquires and releases one audio speech lease', async () => {
    vi.useFakeTimers();
    const release = vi.fn();
    const speak = vi.spyOn(WebGAL.gameplay.figureFaceRuntime, 'speak').mockReturnValue(release);
    vi.spyOn(WebGAL.gameplay.performController, 'unmountPerform').mockImplementation(() => undefined);
    const media = createMedia();
    installDocument(media);
    const perform = playVocal(
      sentence([{ key: 'vocal', value: 'line.ogg' }, { key: 'figureId', value: 'hero' }]),
      true,
    );

    perform.startFunction?.();
    vi.advanceTimersByTime(1);
    await Promise.resolve();

    expect(speak).toHaveBeenCalledWith('hero', { kind: 'audio', media });
    expect(media.play).toHaveBeenCalledOnce();

    perform.stopFunction();
    expect(release).toHaveBeenCalledOnce();
    expect(media.pause).toHaveBeenCalledOnce();
  });

  test('continues playback when face observation fails', () => {
    vi.useFakeTimers();
    vi.spyOn(WebGAL.gameplay.figureFaceRuntime, 'speak').mockImplementation(() => {
      throw new Error('face unavailable');
    });
    vi.spyOn(WebGAL.gameplay.performController, 'unmountPerform').mockImplementation(() => undefined);
    const media = createMedia();
    installDocument(media);
    const perform = playVocal(sentence([{ key: 'vocal', value: 'line.ogg' }]), true);

    perform.startFunction?.();
    vi.advanceTimersByTime(1);

    expect(media.play).toHaveBeenCalledOnce();
  });

  test('does not acquire a bitmap face lease when the caller did not select a Character target', () => {
    vi.useFakeTimers();
    const speak = vi.spyOn(WebGAL.gameplay.figureFaceRuntime, 'speak');
    vi.spyOn(WebGAL.gameplay.performController, 'unmountPerform').mockImplementation(() => undefined);
    const media = createMedia();
    installDocument(media);
    const perform = playVocal(sentence([{ key: 'vocal', value: 'line.ogg' }]));

    perform.startFunction?.();
    vi.advanceTimersByTime(1);

    expect(speak).not.toHaveBeenCalled();
    expect(media.play).toHaveBeenCalledOnce();
  });

  test('waits for the current vocal element and source to be committed before starting', () => {
    vi.useFakeTimers();
    vi.spyOn(WebGAL.gameplay.performController, 'unmountPerform').mockImplementation(() => undefined);
    const staleMedia = createMedia('old.ogg');
    const media = createMedia('line.ogg');
    let lookupCount = 0;
    installDocument(() => (++lookupCount < 3 ? staleMedia : media));
    const perform = playVocal(sentence([{ key: 'vocal', value: 'line.ogg' }]));

    perform.startFunction?.();
    vi.advanceTimersByTime(40);

    expect(lookupCount).toBe(3);
    expect(staleMedia.play).not.toHaveBeenCalled();
    expect(media.play).toHaveBeenCalledOnce();
  });

  test('fully unmounts when the vocal element never becomes available', () => {
    vi.useFakeTimers();
    const unmount = vi
      .spyOn(WebGAL.gameplay.performController, 'unmountPerform')
      .mockImplementation(() => undefined);
    installDocument(() => null);
    const perform = playVocal(sentence([{ key: 'vocal', value: 'missing.ogg' }]));

    perform.startFunction?.();
    vi.runAllTimers();

    expect(unmount).toHaveBeenLastCalledWith('vocal-play');
    expect(perform.blockingAuto()).toBe(false);
  });

  test('cancels a pending element retry when the perform stops', () => {
    vi.useFakeTimers();
    const media = createMedia();
    let available = false;
    installDocument(() => (available ? media : null));
    const perform = playVocal(sentence([{ key: 'vocal', value: 'line.ogg' }]));

    perform.startFunction?.();
    vi.advanceTimersByTime(1);
    perform.stopFunction();
    available = true;
    vi.runAllTimers();

    expect(media.play).not.toHaveBeenCalled();
  });
});

function createMedia(declaredSource?: string): HTMLMediaElement {
  return {
    currentTime: 0,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    onended: null,
    getAttribute: vi.fn((name: string) => (name === 'src' ? declaredSource ?? null : null)),
  } as unknown as HTMLMediaElement;
}

function installDocument(media: HTMLMediaElement | null | (() => HTMLMediaElement | null)): void {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: { getElementById: () => (typeof media === 'function' ? media() : media) },
  });
}

function sentence(args: ISentence['args']): ISentence {
  return {
    command: commandType.say,
    commandRaw: '',
    content: 'line',
    args,
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    isLineBreakHolder: false,
  };
}
