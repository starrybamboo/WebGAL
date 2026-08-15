import { describe, expect, test } from 'vitest';
import { BitmapFaceAdapter, type IBitmapFaceLayerHandle } from './BitmapFaceAdapter';

interface ObservedLayer {
  texture: string;
  visible: boolean;
}

describe('BitmapFaceAdapter', () => {
  test('atomically presents independent eye and mouth overlays', async () => {
    const layers = new Map<string, ObservedLayer>();
    const adapter = new BitmapFaceAdapter<string>(
      {
        eyes: {
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          halfUrl: '/eyes-half.png',
          closedUrl: '/eyes-closed.png',
        },
        mouth: {
          x: 5,
          y: 6,
          width: 7,
          height: 8,
          halfOpenUrl: '/mouth-half.png',
          openUrl: '/mouth-open.png',
        },
      },
      { sourceWidth: 100, sourceHeight: 200, scale: 1, centerY: 100 },
      {
        loadTexture: async (url) => url,
        attachLayer: (layer, texture) => observeLayer(layers, layer, texture),
        requestRender: () => undefined,
        reportError: () => undefined,
      },
    );

    await adapter.ready;
    adapter.present({ eyeOpen: 0, mouthOpen: 1 });

    expect(layers.get('eyes')).toEqual({ texture: '/eyes-closed.png', visible: true });
    expect(layers.get('mouth')).toEqual({ texture: '/mouth-half.png', visible: true });
    adapter.present({ eyeOpen: 0, mouthOpen: 1 });
    expect(layers.get('mouth')).toEqual({ texture: '/mouth-open.png', visible: true });
    adapter.present({ eyeOpen: 1, mouthOpen: 0 });
    expect(layers.get('eyes')?.visible).toBe(false);
    expect(layers.get('mouth')).toEqual({ texture: '/mouth-half.png', visible: true });
    adapter.present({ eyeOpen: 1, mouthOpen: 0 });
    expect(layers.get('mouth')?.visible).toBe(false);

    adapter.present({ eyeOpen: 0, mouthOpen: 1 });
    adapter.release();
    expect(layers.get('eyes')?.visible).toBe(false);
    expect(layers.get('mouth')?.visible).toBe(false);
  });

  test('falls back to full frames when half frames are omitted', async () => {
    const layers = new Map<string, ObservedLayer>();
    const adapter = new BitmapFaceAdapter<string>(
      {
        eyes: { x: 1, y: 2, width: 3, height: 4, closedUrl: '/eyes-closed.png' },
        mouth: { x: 5, y: 6, width: 7, height: 8, openUrl: '/mouth-open.png' },
      },
      { sourceWidth: 100, sourceHeight: 200, scale: 1, centerY: 100 },
      {
        loadTexture: async (url) => url,
        attachLayer: (layer, texture) => observeLayer(layers, layer, texture),
        requestRender: () => undefined,
        reportError: () => undefined,
      },
    );

    await adapter.ready;
    adapter.present({ eyeOpen: 0.5, mouthOpen: 0.5 });

    expect(layers.get('eyes')).toEqual({ texture: '/eyes-closed.png', visible: true });
    expect(layers.get('mouth')).toEqual({ texture: '/mouth-open.png', visible: true });
  });

  test('disables only the failed channel', async () => {
    const errors: string[] = [];
    const layers = new Map<string, ObservedLayer>();
    const adapter = new BitmapFaceAdapter<string>(
      {
        eyes: { x: 1, y: 2, width: 3, height: 4, closedUrl: '/eyes-closed.png' },
        mouth: { x: 5, y: 6, width: 7, height: 8, openUrl: '/mouth-open.png' },
      },
      { sourceWidth: 100, sourceHeight: 200, scale: 1, centerY: 100 },
      {
        loadTexture: async (url) => {
          if (url.includes('eyes')) throw new Error('missing');
          return url;
        },
        attachLayer: (layer, texture) => observeLayer(layers, layer, texture),
        requestRender: () => undefined,
        reportError: (message) => errors.push(message),
      },
    );

    await adapter.ready;
    adapter.present({ eyeOpen: 0, mouthOpen: 1 });

    expect(layers.has('eyes')).toBe(false);
    expect(layers.get('mouth')?.visible).toBe(true);
    expect(errors).toHaveLength(1);
  });

  test('keeps the channel when only an optional half frame fails', async () => {
    const errors: string[] = [];
    const layers = new Map<string, ObservedLayer>();
    const adapter = new BitmapFaceAdapter<string>(
      {
        mouth: {
          x: 5,
          y: 6,
          width: 7,
          height: 8,
          halfOpenUrl: '/mouth-half.png',
          openUrl: '/mouth-open.png',
        },
      },
      { sourceWidth: 100, sourceHeight: 200, scale: 1, centerY: 100 },
      {
        loadTexture: async (url) => {
          if (url.includes('half')) throw new Error('missing');
          return url;
        },
        attachLayer: (layer, texture) => observeLayer(layers, layer, texture),
        requestRender: () => undefined,
        reportError: (message) => errors.push(message),
      },
    );

    await adapter.ready;
    adapter.present({ mouthOpen: 1 });

    expect(layers.get('mouth')).toEqual({ texture: '/mouth-open.png', visible: true });
    expect(errors).toHaveLength(1);
  });
});

function observeLayer(
  layers: Map<string, ObservedLayer>,
  name: string,
  texture: string,
): IBitmapFaceLayerHandle<string> {
  const layer = { texture, visible: false };
  layers.set(name, layer);
  return {
    setTexture: (next) => {
      layer.texture = next;
    },
    setVisible: (visible) => {
      layer.visible = visible;
    },
  };
}
