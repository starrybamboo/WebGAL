import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CharacterFigureService } from './characterFigureService';
import { resolveCharacterFacialRigResources } from './characterFacialRig';
import { resolveCharacterTemplateSelection, type ICharacterTemplate } from './characterTemplate';

test('keeps the bundled silver-schoolgirl template aligned with its real replacement assets', () => {
  const sampleDirectory = resolve(process.cwd(), 'public/game/figure/silver-schoolgirl');
  const template = JSON.parse(readFileSync(resolve(sampleDirectory, 'figure.json'), 'utf8')) as ICharacterTemplate;
  const composition = resolveCharacterTemplateSelection(template, ['live']);

  expect(composition.canvas).toEqual({ width: 1024, height: 1536 });
  expect(readPngSize(resolve(sampleDirectory, 'base.png'))).toEqual(composition.canvas);
  expect(readPngSize(resolve(sampleDirectory, 'eyes-half.png'))).toEqual({ width: 168, height: 113 });
  expect(readPngSize(resolve(sampleDirectory, 'eyes-closed.png'))).toEqual({ width: 168, height: 113 });
  expect(readPngSize(resolve(sampleDirectory, 'mouth-half.png'))).toEqual({ width: 82, height: 73 });
  expect(readPngSize(resolve(sampleDirectory, 'mouth-open.png'))).toEqual({ width: 82, height: 73 });
  expect(composition.facialRig).toEqual({
    eyes: {
      x: 485,
      y: 228,
      width: 168,
      height: 113,
      half: 'eyes-half.png',
      closed: 'eyes-closed.png',
    },
    mouth: {
      x: 531,
      y: 317,
      width: 82,
      height: 73,
      halfOpen: 'mouth-half.png',
      open: 'mouth-open.png',
    },
  });
});

test('resolves every facial replacement resource inside the character directory', () => {
  const resolved = resolveCharacterFacialRigResources(
    {
      eyes: { x: 485, y: 228, width: 168, height: 113, half: 'eyes-half.png', closed: 'eyes-closed.png' },
      mouth: { x: 531, y: 317, width: 82, height: 73, halfOpen: 'mouth-half.png', open: 'mouth-open.png' },
    },
    'http://localhost/game/figure/role_7/figure.json',
  );

  expect(resolved).toEqual({
    eyes: {
      x: 485,
      y: 228,
      width: 168,
      height: 113,
      halfUrl: 'http://localhost/game/figure/role_7/eyes-half.png',
      closedUrl: 'http://localhost/game/figure/role_7/eyes-closed.png',
    },
    mouth: {
      x: 531,
      y: 317,
      width: 82,
      height: 73,
      halfOpenUrl: 'http://localhost/game/figure/role_7/mouth-half.png',
      openUrl: 'http://localhost/game/figure/role_7/mouth-open.png',
    },
  });
});

test('delivers a preset facial rig beside the cached composite image', async () => {
  const service = new CharacterFigureService({
    getTemplateUrl: () => 'http://localhost/game/figure/role_7/figure.json',
    loadTemplate: async () => ({
      Version: 1,
      canvas: { width: 1600, height: 3000 },
      components: {
        base: { src: 'base.png', x: 0, y: 0, width: 1024, height: 1536 },
      },
      presets: {
        live: {
          canvas: { width: 1024, height: 1536 },
          items: ['base'],
          facialRig: {
            eyes: { x: 485, y: 228, width: 168, height: 113, closed: 'eyes-closed.png' },
            mouth: { x: 531, y: 317, width: 82, height: 73, open: 'mouth-open.png' },
          },
        },
      },
    }),
    compose: async () => 'data:image/png;base64,composite',
  });

  await expect(service.prepareFigure({ name: 'role_7', items: ['live'] })).resolves.toEqual({
    sourceUrl: 'data:image/png;base64,composite',
    facialRig: {
      eyes: {
        x: 485,
        y: 228,
        width: 168,
        height: 113,
        closedUrl: 'http://localhost/game/figure/role_7/eyes-closed.png',
      },
      mouth: {
        x: 531,
        y: 317,
        width: 82,
        height: 73,
        openUrl: 'http://localhost/game/figure/role_7/mouth-open.png',
      },
    },
  });
});

function readPngSize(filePath: string): { width: number; height: number } {
  const png = readFileSync(filePath);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
