import { describe, expect, test, vi } from 'vitest';
import type { IPerformDefinition } from './pixiPerformManager';
import {
  BrowserRuntimePerformScriptHost,
  RuntimePerformLoader,
  buildRuntimePerformScriptUrl,
  createRuntimePixiPerformInterface,
  validateRuntimePerformName,
} from './runtimePixiPerformLoader';

describe('runtime Pixi perform paths', () => {
  test('maps a slash-separated name to one script under the game directory', () => {
    expect(buildRuntimePerformScriptUrl('weather/rain', 'https://example.com/games/demo/index.html')).toBe(
      'https://example.com/games/demo/game/pixi-performs/weather/rain.js',
    );
  });

  test.each(['../rain', 'weather\\rain', '/rain', 'https://evil.test/rain', 'rain.js', 'rain?debug'])(
    'rejects unsafe runtime perform name %s',
    (name) => {
      expect(() => validateRuntimePerformName(name)).toThrow('Invalid runtime perform name');
    },
  );
});

describe('runtime registration interface', () => {
  test('forwards the requested definition to the existing perform registry', () => {
    const registerPerform = vi.fn();
    const definition: IPerformDefinition = { fg: vi.fn() };
    const runtime = createRuntimePixiPerformInterface({
      getExpectedName: () => 'spark',
      hasPerform: () => false,
      registerPerform,
    });

    runtime.register('spark', definition);

    expect(registerPerform).toHaveBeenCalledWith('spark', definition);
    expect(runtime.version).toBe(1);
    expect(Object.isFrozen(runtime)).toBe(true);
  });

  test('only accepts registration from the matching engine-loaded script', () => {
    const createRuntime = (expectedName: string | null) =>
      createRuntimePixiPerformInterface({
        getExpectedName: () => expectedName,
        hasPerform: () => false,
        registerPerform: vi.fn(),
      });

    expect(() => createRuntime(null).register('spark', { fg: vi.fn() })).toThrow('engine-loaded script');
    expect(() => createRuntime('rain').register('spark', { fg: vi.fn() })).toThrow('cannot register "spark"');
  });

  test('does not let a runtime script replace an existing perform', () => {
    const runtime = createRuntimePixiPerformInterface({
      getExpectedName: () => 'snow',
      hasPerform: () => true,
      registerPerform: vi.fn(),
    });

    expect(() => runtime.register('snow', { fg: vi.fn() })).toThrow('cannot replace an existing perform');
  });
});

describe('RuntimePerformLoader', () => {
  test('deduplicates concurrent loads and uses the registry after success', async () => {
    let registered = false;
    let finishLoad: () => void = () => undefined;
    const loadReady = new Promise<void>((resolve) => {
      finishLoad = () => {
        registered = true;
        resolve();
      };
    });
    const load = vi.fn(() => loadReady);
    const installRuntimeInterface = vi.fn();
    const loader = new RuntimePerformLoader({
      hasPerform: () => registered,
      getPageHref: () => 'https://example.com/game/index.html',
      installRuntimeInterface,
      scriptHost: { load },
    });

    const first = loader.ensure('spark');
    const second = loader.ensure('spark');
    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({
      name: 'spark',
      url: 'https://example.com/game/game/pixi-performs/spark.js',
    });
    expect(installRuntimeInterface).toHaveBeenCalledTimes(1);

    finishLoad();
    await expect(first).resolves.toBeUndefined();
    await expect(loader.ensure('spark')).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('loads again after an existing runtime perform is unregistered', async () => {
    let registered = false;
    const load = vi.fn(async () => {
      registered = true;
    });
    const loader = new RuntimePerformLoader({
      hasPerform: () => registered,
      getPageHref: () => 'https://example.com/index.html',
      installRuntimeInterface: () => undefined,
      scriptHost: { load },
    });

    await expect(loader.ensure('reloadable')).resolves.toBeUndefined();
    registered = false;
    await expect(loader.ensure('reloadable')).resolves.toBeUndefined();

    expect(load).toHaveBeenCalledTimes(2);
  });

  test('removes failed requests so a corrected file can be retried', async () => {
    let registered = false;
    const load = vi
      .fn<[], Promise<void>>()
      .mockRejectedValueOnce(new Error('missing'))
      .mockImplementationOnce(async () => {
        registered = true;
      });
    const loader = new RuntimePerformLoader({
      hasPerform: () => registered,
      getPageHref: () => 'https://example.com/index.html',
      installRuntimeInterface: () => undefined,
      scriptHost: { load },
    });

    await expect(loader.ensure('fixed')).rejects.toThrow('missing');
    await expect(loader.ensure('fixed')).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  test('rejects a script that finishes without registering its requested name', async () => {
    const loader = new RuntimePerformLoader({
      hasPerform: () => false,
      getPageHref: () => 'https://example.com/index.html',
      installRuntimeInterface: () => undefined,
      scriptHost: { load: async () => undefined },
    });

    await expect(loader.ensure('empty')).rejects.toThrow('did not register "empty"');
  });

  test('rejects invalid names before installing the runtime or creating a script', async () => {
    const installRuntimeInterface = vi.fn();
    const load = vi.fn(async () => undefined);
    const loader = new RuntimePerformLoader({
      hasPerform: () => false,
      getPageHref: () => 'https://example.com/index.html',
      installRuntimeInterface,
      scriptHost: { load },
    });

    await expect(loader.ensure('../escape')).rejects.toThrow('Invalid runtime perform name');
    expect(installRuntimeInterface).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
});

test('BrowserRuntimePerformScriptHost marks the script and resolves on load', async () => {
  const script = {
    async: false,
    src: '',
    dataset: {} as DOMStringMap,
    onload: null as null | (() => void),
    onerror: null as null | (() => void),
    remove: vi.fn(),
  };
  const appendChild = vi.fn();
  const clearTimeout = vi.fn();
  const ownerDocument = {
    head: { appendChild },
    documentElement: null,
    createElement: vi.fn(() => script),
  } as unknown as Document;
  const host = new BrowserRuntimePerformScriptHost({
    document: ownerDocument,
    setTimeout: () => 1 as unknown as ReturnType<typeof setTimeout>,
    clearTimeout,
    timeoutMs: 10_000,
  });

  const loaded = host.load({ name: 'spark', url: 'https://example.com/game/pixi-performs/spark.js' });
  expect(script.async).toBe(true);
  expect(script.src).toBe('https://example.com/game/pixi-performs/spark.js');
  expect(script.dataset.webgalPixiPerform).toBe('spark');
  expect(appendChild).toHaveBeenCalledWith(script);

  script.onload?.();
  await expect(loaded).resolves.toBeUndefined();
  expect(clearTimeout).toHaveBeenCalledTimes(1);
  expect(script.remove).toHaveBeenCalledTimes(1);
});
