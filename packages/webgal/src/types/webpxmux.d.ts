declare module 'webpxmux' {
  type DecodeFrame = { duration: number; rgba: Uint32Array };
  type DecodeResult = { width: number; height: number; frames: DecodeFrame[] };
  type WebPXMuxInstance = {
    waitRuntime: () => Promise<void>;
    decodeFrames: (data: Uint8Array) => Promise<DecodeResult>;
  };
  const createWebPXMux: (wasmPath?: string) => WebPXMuxInstance;
  export default createWebPXMux;
}

declare module 'webpxmux/dist/webpxmux' {
  type DecodeFrame = { duration: number; rgba: Uint32Array };
  type DecodeResult = { width: number; height: number; frames: DecodeFrame[] };
  type WebPXMuxInstance = {
    waitRuntime: () => Promise<void>;
    decodeFrames: (data: Uint8Array) => Promise<DecodeResult>;
  };
  const createWebPXMux: (wasmPath?: string) => WebPXMuxInstance;
  export default createWebPXMux;
}
