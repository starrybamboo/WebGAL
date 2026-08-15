import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { commandType, ISentence } from '@/Core/controller/scene/sceneInterface';
import type { ILayerResult, IPerformDefinition } from '@/Core/util/pixiPerformManager/pixiPerformManager';
import { registerPerform, unregisterPerform } from '@/Core/util/pixiPerformManager/pixiPerformManager';
import { logger } from '@/Core/util/logger';
import { WebGAL } from '@/Core/WebGAL';
import { pixi } from './index';

interface TestScript {
  async: boolean;
  src: string;
  dataset: Record<string, string>;
  onload: null | (() => void);
  onerror: null | (() => void);
  remove: ReturnType<typeof vi.fn>;
}

interface ScriptHarness {
  getScript(): TestScript;
  register(name: string, definition: IPerformDefinition): void;
}

const previousPixiStage = WebGAL.gameplay.pixiStage;
const registeredNames = new Set<string>();
const removeForegroundChild = vi.fn();
const removeBackgroundChild = vi.fn();
const removeAnimation = vi.fn();

function createSentence(content: string): ISentence {
  return {
    command: commandType.pixi,
    commandRaw: `pixiPerform:${content}`,
    content,
    args: [],
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    isLineBreakHolder: false,
  };
}

function createLayer(key: string): ILayerResult {
  return {
    container: { destroy: vi.fn() } as unknown as ILayerResult['container'],
    tickerKey: key,
  };
}

function registerTestPerform(name: string, definition: IPerformDefinition): void {
  registerPerform(name, definition);
  registeredNames.add(name);
}

function installScriptHarness(baseURI = 'http://localhost/'): ScriptHarness {
  const scripts: TestScript[] = [];
  const documentState = {
    baseURI,
    currentScript: null as HTMLScriptElement | null,
    head: {
      appendChild: (script: TestScript) => {
        scripts.push(script);
        return script;
      },
    },
    documentElement: null,
    createElement: () => ({
      async: false,
      src: '',
      dataset: {},
      onload: null,
      onerror: null,
      remove: vi.fn(),
    }),
  };
  vi.stubGlobal('document', documentState as unknown as Document);

  return {
    getScript: () => {
      const script = scripts[0];
      if (!script) throw new Error('Expected the runtime loader to append a script.');
      return script;
    },
    register: (name, definition) => {
      const script = scripts[0];
      if (!script) throw new Error('Expected the runtime loader to append a script.');
      documentState.currentScript = script as unknown as HTMLScriptElement;
      try {
        window.WebGALPixiPerform!.register(name, definition);
        registeredNames.add(name);
      } finally {
        documentState.currentScript = null;
      }
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  WebGAL.gameplay.pixiStage = {
    foregroundEffectsContainer: { removeChild: removeForegroundChild },
    backgroundEffectsContainer: { removeChild: removeBackgroundChild },
    removeAnimation,
  } as unknown as typeof WebGAL.gameplay.pixiStage;
  vi.spyOn(WebGAL.gameplay.performController, 'softUnmountPerformObject').mockImplementation(() => undefined);
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const name of registeredNames) unregisterPerform(name);
  registeredNames.clear();
  WebGAL.gameplay.pixiStage = previousPixiStage;
  delete window.WebGALPixiPerform;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('keeps an existing perform synchronous and non-blocking', () => {
  const fg = createLayer('builtin');
  const generator = vi.fn(() => fg);
  registerTestPerform('runtime-test-existing', { fg: generator });
  const perform = pixi(createSentence('runtime-test-existing'));

  perform.startFunction?.();

  expect(generator).toHaveBeenCalledTimes(1);
  expect(perform.blockingNext()).toBe(false);
});

test('loads an unknown script from the document base and blocks until it mounts', async () => {
  const harness = installScriptHarness('http://localhost/player/');
  const fg = createLayer('runtime');
  const generator = vi.fn(() => fg);
  const perform = pixi(createSentence('runtime-test/load'));

  perform.startFunction?.();

  const script = harness.getScript();
  expect(script.src).toBe('http://localhost/player/game/pixi-performs/runtime-test/load.js');
  expect(script.dataset.webgalPixiPerform).toBe('runtime-test/load');
  expect(perform.blockingNext()).toBe(true);
  expect(perform.blockingAuto()).toBe(true);
  expect(generator).not.toHaveBeenCalled();

  harness.register('runtime-test/load', { fg: generator });
  script.onload?.();
  await flushMicrotasks();

  expect(generator).toHaveBeenCalledTimes(1);
  expect(perform.blockingNext()).toBe(false);
});

test('releases and unmounts a perform when its script fails to load', async () => {
  const harness = installScriptHarness();
  const perform = pixi(createSentence('runtime-test-missing'));
  const softUnmount = vi.mocked(WebGAL.gameplay.performController.softUnmountPerformObject);

  perform.startFunction?.();
  expect(perform.blockingNext()).toBe(true);
  harness.getScript().onerror?.();
  await flushMicrotasks();

  expect(perform.blockingNext()).toBe(false);
  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('runtime-test-missing'), expect.any(Error));
  expect(softUnmount).toHaveBeenCalledWith(perform);
});

test('does not mount a script that finishes loading after the perform was stopped', async () => {
  const harness = installScriptHarness();
  const generator = vi.fn(() => createLayer('late'));
  const perform = pixi(createSentence('runtime-test-late'));

  perform.startFunction?.();
  const script = harness.getScript();
  perform.stopFunction();
  harness.register('runtime-test-late', { fg: generator });
  script.onload?.();
  await flushMicrotasks();

  expect(generator).not.toHaveBeenCalled();
  expect(perform.blockingNext()).toBe(false);
});

test('keeps the existing foreground and background cleanup path', () => {
  const fg = createLayer('fg-key');
  const bg = createLayer('bg-key');
  registerTestPerform('runtime-test-both', { fg: () => fg, bg: () => bg });
  const perform = pixi(createSentence('runtime-test-both'));

  perform.startFunction?.();
  perform.stopFunction();

  expect(fg.container.destroy).toHaveBeenCalledWith({ texture: true, baseTexture: true });
  expect(bg.container.destroy).toHaveBeenCalledWith({ texture: true, baseTexture: true });
  expect(removeForegroundChild).toHaveBeenCalledWith(fg.container);
  expect(removeBackgroundChild).toHaveBeenCalledWith(bg.container);
  expect(removeAnimation).toHaveBeenCalledWith('fg-key');
  expect(removeAnimation).toHaveBeenCalledWith('bg-key');
});

test('turns an error during first runtime setup into a reclaimed perform', async () => {
  const harness = installScriptHarness();
  const error = new Error('setup failed');
  const perform = pixi(createSentence('runtime-test-broken'));
  const softUnmount = vi.mocked(WebGAL.gameplay.performController.softUnmountPerformObject);

  perform.startFunction?.();
  const script = harness.getScript();
  harness.register('runtime-test-broken', {
    fg: () => {
      throw error;
    },
  });
  script.onload?.();
  await flushMicrotasks();

  expect(perform.blockingNext()).toBe(false);
  expect(softUnmount).toHaveBeenCalledWith(perform);
});
