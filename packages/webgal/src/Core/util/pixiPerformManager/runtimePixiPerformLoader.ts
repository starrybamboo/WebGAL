import { IPerformDefinition, hasPerform, registerPerform } from '@/Core/util/pixiPerformManager/pixiPerformManager';

const RUNTIME_PERFORM_NAME = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const DEFAULT_LOAD_TIMEOUT_MS = 10_000;

export interface IWebGALPixiPerformRuntime {
  readonly version: 1;
  register(name: string, definition: IPerformDefinition): void;
}

export interface IRuntimePerformScriptRequest {
  name: string;
  url: string;
}

export interface IRuntimePerformScriptHost {
  load(request: IRuntimePerformScriptRequest): Promise<void>;
}

interface IRuntimePerformLoaderDeps {
  hasPerform(name: string): boolean;
  getPageHref(): string;
  installRuntimeInterface(): void;
  scriptHost: IRuntimePerformScriptHost;
}

interface IRuntimeInterfaceDeps {
  getExpectedName(): string | null;
  hasPerform(name: string): boolean;
  registerPerform(name: string, definition: IPerformDefinition): void;
}

interface IBrowserScriptHostDeps {
  document: Document;
  setTimeout(callback: () => void, timeoutMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timeout: ReturnType<typeof setTimeout>): void;
  timeoutMs: number;
}

const createDefaultInterfaceDeps = (): IRuntimeInterfaceDeps => ({
  getExpectedName: () => {
    if (typeof document === 'undefined') return null;
    const script = document.currentScript as HTMLScriptElement | null;
    return script?.dataset?.webgalPixiPerform ?? null;
  },
  hasPerform,
  registerPerform,
});

const createDefaultBrowserHostDeps = (): IBrowserScriptHostDeps => ({
  document,
  setTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
  clearTimeout: (timeout) => clearTimeout(timeout),
  timeoutMs: DEFAULT_LOAD_TIMEOUT_MS,
});

export function validateRuntimePerformName(name: string): void {
  if (typeof name !== 'string' || !RUNTIME_PERFORM_NAME.test(name)) {
    throw new Error(
      `Invalid runtime perform name "${String(name)}". Expected slash-separated ASCII letters, numbers, "_" or "-".`,
    );
  }
}

export function buildRuntimePerformScriptUrl(name: string, pageHref: string): string {
  validateRuntimePerformName(name);
  return new URL(`${name}.js`, new URL('./game/pixi-performs/', pageHref)).href;
}

export function createRuntimePixiPerformInterface(
  deps: IRuntimeInterfaceDeps = createDefaultInterfaceDeps(),
): IWebGALPixiPerformRuntime {
  return Object.freeze({
    version: 1 as const,
    register: (name: string, definition: IPerformDefinition) => {
      const expectedName = deps.getExpectedName();
      if (!expectedName) {
        throw new Error('Runtime performs can only register while their engine-loaded script is executing.');
      }
      if (name !== expectedName) {
        throw new Error(`Runtime perform script for "${expectedName}" cannot register "${name}".`);
      }
      if (deps.hasPerform(name)) {
        throw new Error(`Runtime perform "${name}" cannot replace an existing perform.`);
      }
      deps.registerPerform(name, definition);
    },
  });
}

export function installRuntimePixiPerformInterface(target: Window = window): IWebGALPixiPerformRuntime {
  const runtime = createRuntimePixiPerformInterface();
  target.WebGALPixiPerform = runtime;
  return runtime;
}

export class BrowserRuntimePerformScriptHost implements IRuntimePerformScriptHost {
  public constructor(private readonly injectedDeps?: IBrowserScriptHostDeps) {}

  public load(request: IRuntimePerformScriptRequest): Promise<void> {
    const deps = this.injectedDeps ?? createDefaultBrowserHostDeps();
    const ownerDocument = deps.document;
    const parent = ownerDocument.head ?? ownerDocument.documentElement;
    if (!parent) {
      return Promise.reject(new Error('Cannot load a runtime perform before the document root is ready.'));
    }

    return new Promise<void>((resolve, reject) => {
      const script = ownerDocument.createElement('script');
      script.async = true;
      script.src = request.url;
      script.dataset.webgalPixiPerform = request.name;

      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        deps.clearTimeout(timeout);
        script.onload = null;
        script.onerror = null;
        script.remove();
        if (error) reject(error);
        else resolve();
      };

      timeout = deps.setTimeout(() => {
        finish(new Error(`Timed out loading runtime perform "${request.name}" from ${request.url}.`));
      }, deps.timeoutMs);
      script.onload = () => finish();
      script.onerror = () => finish(new Error(`Failed to load runtime perform "${request.name}" from ${request.url}.`));
      parent.appendChild(script);
    });
  }
}

export class RuntimePerformLoader {
  private readonly requests = new Map<string, Promise<void>>();

  public constructor(private readonly deps: IRuntimePerformLoaderDeps) {}

  public ensure(name: string): Promise<void> {
    if (this.deps.hasPerform(name)) return Promise.resolve();

    const existing = this.requests.get(name);
    if (existing) return existing;

    let scriptUrl: string;
    try {
      scriptUrl = buildRuntimePerformScriptUrl(name, this.deps.getPageHref());
      this.deps.installRuntimeInterface();
    } catch (error) {
      return Promise.reject(error);
    }

    const request = this.deps.scriptHost
      .load({ name, url: scriptUrl })
      .then(() => {
        if (!this.deps.hasPerform(name)) {
          throw new Error(`Runtime perform script loaded but did not register "${name}": ${scriptUrl}`);
        }
        this.requests.delete(name);
      })
      .catch((error) => {
        this.requests.delete(name);
        throw error;
      });

    this.requests.set(name, request);
    return request;
  }
}

const defaultRuntimePerformLoader = new RuntimePerformLoader({
  hasPerform,
  getPageHref: () => document.baseURI || window.location.href,
  installRuntimeInterface: () => installRuntimePixiPerformInterface(),
  scriptHost: new BrowserRuntimePerformScriptHost(),
});

export function ensureRuntimePerformLoaded(name: string): Promise<void> {
  return defaultRuntimePerformLoader.ensure(name);
}
