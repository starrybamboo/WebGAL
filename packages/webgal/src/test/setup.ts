import { logger } from '@/Core/util/logger';

if (typeof window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      __WEBGAL_DEVICE_INFO__: undefined,
      live2dPromise: new Promise(() => undefined),
      location: {
        href: 'http://localhost/',
        origin: 'http://localhost',
      },
      requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
      cancelAnimationFrame: (handle: number) => clearTimeout(handle),
    },
  });
}

logger.setLevel('ERROR');

export {};
