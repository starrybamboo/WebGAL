import { describe, expect, test } from 'vitest';
import { composeCharacterImage, ICharacterImageComposerDependencies } from './characterImageComposer';

interface ITestRasterSource {
  color: string;
}

interface ITestRasterImage {
  color: string;
  width: number;
  height: number;
  delayMs?: number;
}

describe('character image composition', () => {
  test('renders source-over layers in declared order with offsets, scale and canvas clipping', async () => {
    const result = await composeCharacterImage(
      {
        canvas: { width: 3, height: 2 },
        layers: [
          { name: 'base', src: 'base.webp', x: 0, y: 0, scale: 1 },
          { name: 'face', src: 'face.webp', x: 1, y: 0, scale: 1 },
          { name: 'trim', src: 'trim.webp', x: -1, y: 1, scale: 2 },
        ],
      },
      'https://game.example/game/figure/yuki/figure.json',
      createRasterDependencies({
        'base.webp': { color: 'R', width: 2, height: 2, delayMs: 10 },
        'face.webp': { color: 'B', width: 1, height: 1 },
        'trim.webp': { color: 'G', width: 2, height: 1, delayMs: 5 },
      }),
    );

    expect(result).toBe('data:test,RB./GGG');
  });

  test('draws exact width and height non-uniformly and clips at the composite canvas boundary', async () => {
    const result = await composeCharacterImage(
      {
        canvas: { width: 4, height: 3 },
        layers: [
          { name: 'base', src: 'base.webp', x: 0, y: 0 },
          { name: 'face', src: 'face.webp', x: 2, y: 1, width: 4, height: 1 },
        ],
      },
      'https://game.example/game/figure/yuki/figure.json',
      createRasterDependencies({
        'base.webp': { color: 'R', width: 2, height: 3 },
        'face.webp': { color: 'B', width: 1, height: 2 },
      }),
    );

    expect(result).toBe('data:test,RR../RRBB/RR..');
  });

  test('a failed composition can be retried after the resource is fixed', async () => {
    const rasterDependencies = createRasterDependencies({
      'body.webp': { color: 'R', width: 1, height: 1 },
    });
    let failNextLoad = true;
    const dependencies: ICharacterImageComposerDependencies = {
      ...rasterDependencies,
      loadImage: async (sourceUrl) => {
        if (failNextLoad) {
          failNextLoad = false;
          throw new Error('temporary image failure');
        }
        return rasterDependencies.loadImage(sourceUrl);
      },
    };
    const composition = {
      canvas: { width: 1, height: 1 },
      layers: [{ name: 'body', src: 'body.webp', x: 0, y: 0, scale: 1 }],
    };

    await expect(
      composeCharacterImage(composition, 'https://game.example/game/figure/yuki/figure.json', dependencies),
    ).rejects.toThrowError('temporary image failure');
    await expect(
      composeCharacterImage(composition, 'https://game.example/game/figure/yuki/figure.json', dependencies),
    ).resolves.toBe('data:test,R');
  });
});

function createRasterDependencies(images: Record<string, ITestRasterImage>): ICharacterImageComposerDependencies {
  return {
    resolveComponentUrl: (componentPath) => componentPath,
    loadImage: async (sourceUrl) => {
      const image = images[sourceUrl];
      if (!image) {
        throw new Error(`missing test image: ${sourceUrl}`);
      }
      if (image.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, image.delayMs));
      }
      return {
        source: { color: image.color } as unknown as CanvasImageSource,
        width: image.width,
        height: image.height,
      };
    },
    createCanvas: (width, height) => {
      const pixels = Array.from({ length: height }, () => Array<string>(width).fill('.'));
      let compositeOperation: GlobalCompositeOperation = 'source-over';
      const context = {
        get globalCompositeOperation() {
          return compositeOperation;
        },
        set globalCompositeOperation(value: GlobalCompositeOperation) {
          compositeOperation = value;
        },
        drawImage: (source: CanvasImageSource, x: number, y: number, scaledWidth: number, scaledHeight: number) => {
          if (compositeOperation !== 'source-over') {
            throw new Error(`unexpected composite operation: ${compositeOperation}`);
          }
          const color = (source as unknown as ITestRasterSource).color;
          const left = Math.max(0, Math.floor(x));
          const top = Math.max(0, Math.floor(y));
          const right = Math.min(width, Math.ceil(x + scaledWidth));
          const bottom = Math.min(height, Math.ceil(y + scaledHeight));
          for (let row = top; row < bottom; row += 1) {
            for (let column = left; column < right; column += 1) {
              pixels[row][column] = color;
            }
          }
        },
      } as unknown as CanvasRenderingContext2D;
      return {
        context,
        toPngDataUrl: () => `data:test,${pixels.map((row) => row.join('')).join('/')}`,
      };
    },
  };
}
