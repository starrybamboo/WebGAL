import { BaseImageResource, Ticker, UPDATE_PRIORITY, settings } from 'pixi.js';

type WebPXMuxInstance = {
  waitRuntime: () => Promise<void>;
  decodeFrames: (data: Uint8Array) => Promise<{ width: number; height: number; frames: Array<{ duration: number; rgba: Uint32Array }> }>;
};

let webpMuxPromise: Promise<WebPXMuxInstance> | null = null;

const getWebpMux = async (): Promise<WebPXMuxInstance> => {
  if (webpMuxPromise) return webpMuxPromise;
  webpMuxPromise = (async () => {
    const mod = await import('webpxmux/dist/webpxmux');
    const factory = (mod as any).default ?? (mod as any).WebPXMux ?? mod;
    const baseUrl =
      typeof document !== 'undefined'
        ? document.baseURI
        : (import.meta as any).env?.BASE_URL ?? './';
    let wasmPath = '';
    try {
      wasmPath = new URL('lib/webpxmux.wasm', baseUrl).toString();
    } catch {
      const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      wasmPath = `${trimmed}/lib/webpxmux.wasm`;
    }
    const instance: WebPXMuxInstance = factory(wasmPath);
    await instance.waitRuntime();
    return instance;
  })();
  return webpMuxPromise;
};

export interface WebpResourceOptions {
  autoLoad?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  animationSpeed?: number;
  fps?: number;
}

interface PrecomputedFrame {
  start: number;
  end: number;
  imageData: ImageData;
}

const findFrame = (frames: PrecomputedFrame[], time: number) => {
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const f = frames[mid];
    if (time >= f.start && time < f.end) return f;
    if (time < f.start) high = mid - 1;
    else low = mid + 1;
  }
  return undefined;
};

export class WebpResource extends BaseImageResource {
  public static override test(_src: unknown, ext?: string): boolean {
    const srcString =
      typeof _src === 'string' ? _src : _src instanceof HTMLImageElement ? _src.src : '';
    const isWebp =
      ext === 'webp' ||
      (srcString && srcString.trim().toLowerCase().endsWith('.webp'));
    if (!isWebp) return false;
    const normalized = srcString.toLowerCase();
    const isEffectWebp =
      normalized.includes('/game/tex/effects/') || normalized.includes('\\game\\tex\\effects\\');
    return isEffectWebp;
  }

  public declare source: HTMLCanvasElement;

  public autoPlay: boolean;
  public loop: boolean;
  public animationSpeed: number;
  public readonly fps: number;
  public readonly url: string = '';

  private _frames: PrecomputedFrame[] = [];
  private _currentTime = 0;
  private _playing = false;
  private _loadPromise: Promise<this> | null = null;
  public contentBounds: { width: number; height: number } | null = null;

  public constructor(src: unknown, options: WebpResourceOptions = {}) {
    super(document.createElement('canvas'));
    if (typeof src === 'string') this.url = src;
    else if (src instanceof HTMLImageElement) this.url = src.src;
    this.autoPlay = options.autoPlay ?? true;
    this.loop = options.loop ?? true;
    this.animationSpeed = options.animationSpeed ?? 1;
    this.fps = options.fps ?? 30;

    if (options.autoLoad !== false) this.load();
  }

  public override async load(): Promise<this> {
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = (async () => {
      const res = await settings.ADAPTER.fetch(this.url);
      const buffer = await res.arrayBuffer();

      if (!buffer?.byteLength) throw new Error('Invalid WebP buffer');

      let decoded: { width: number; height: number; frames: Array<{ duration: number; rgba: Uint32Array }> } | null =
        null;
      try {
        const mux = await getWebpMux();
        decoded = await mux.decodeFrames(new Uint8Array(buffer));
      } catch (error) {
        console.warn('WebP decode failed, fallback to static frame.', error);
      }
      const { width, height, frames } = decoded ?? { width: 0, height: 0, frames: [] };

      if (!frames?.length || width <= 0 || height <= 0) {
        await this.loadStaticFrame(buffer);
        if (this.autoPlay) this.play();
        return this;
      }

      const durations = frames.map((frame) => frame.duration ?? 0);
      const totalDuration = durations.reduce((sum, value) => sum + value, 0);
      console.info('[WebpResource] decoded', {
        url: this.url,
        frames: frames.length,
        width,
        height,
        totalDurationMs: totalDuration,
        durations: durations.slice(0, 20),
        hasMoreDurations: durations.length > 20,
      });

      const canvas = this.source;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      canvas.width = width;
      canvas.height = height;

      let time = 0;
      let hasContent = false;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      for (const frame of frames) {
        const rgba = frame.rgba;
        const pixels = new Uint8ClampedArray(rgba.length * 4);
        for (let i = 0; i < rgba.length; i++) {
          const value = rgba[i]!;
          const base = i * 4;
          // webpxmux 返回的 Uint32 是 0xRRGGBBAA
          pixels[base] = (value >>> 24) & 0xFF;
          pixels[base + 1] = (value >>> 16) & 0xFF;
          pixels[base + 2] = (value >>> 8) & 0xFF;
          pixels[base + 3] = value & 0xFF;
          if (pixels[base + 3] > 0) {
            const x = i % width;
            const y = (i / width) | 0;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            hasContent = true;
          }
        }
        const imageData = new ImageData(pixels, width, height);
        const durationMs = Math.max(frame.duration ?? 0, 1);
        this._frames.push({ start: time, end: (time += durationMs), imageData });
      }
      if (hasContent) {
        this.contentBounds = {
          width: Math.max(1, maxX - minX + 1),
          height: Math.max(1, maxY - minY + 1),
        };
      } else {
        this.contentBounds = { width, height };
      }

      if (!this._frames.length) {
        await this.loadStaticFrame(buffer);
      } else {
        super.update();
      }

      if (this.autoPlay) this.play();

      return this;
    })();

    return this._loadPromise;
  }

  public play(): void {
    if (this._playing) return;
    this._playing = true;
    Ticker.shared.add(this._update, this, UPDATE_PRIORITY.HIGH);
  }

  public stop(): void {
    if (!this._playing) return;
    this._playing = false;
    Ticker.shared.remove(this._update, this);
  }

  public override dispose(): void {
    this.stop();
    super.dispose();
    this._frames = [];
    this._loadPromise = null;
  }

  private async loadStaticFrame(buffer: ArrayBuffer): Promise<void> {
    const canvas = this.source;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const blob = new Blob([buffer], { type: 'image/webp' });
    let bitmap: ImageBitmap | null = null;
    try {
      if (typeof createImageBitmap === 'function') {
        bitmap = await createImageBitmap(blob);
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);
      } else {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        await img.decode();
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      }
    } finally {
      bitmap?.close?.();
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const defaultDelay = 1000 / this.fps;
    this._frames = [{ start: 0, end: defaultDelay, imageData }];
    super.update();
  }

  private _update(): void {
    if (!this._playing || !this._frames.length) return;

    this._currentTime += Ticker.shared.deltaMS * this.animationSpeed;
    const frame = findFrame(this._frames, this._currentTime);

    if (frame) {
      this.source.getContext('2d')!.putImageData(frame.imageData, 0, 0);
      super.update();
    }

    const end = this._frames[this._frames.length - 1].end;
    if (this._currentTime > end) {
      if (this.loop) this._currentTime %= end;
      else this.stop();
    }
  }
}
