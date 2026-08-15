import { describe, expect, test } from 'vitest';
import {
  CharacterTemplateError,
  ICharacterTemplate,
  parseCharacterSelector,
  resolveCharacterTemplateSelection,
} from './characterTemplate';

describe('character template rules', () => {
  test('resolves a single static component from a character selector', () => {
    const selector = parseCharacterSelector('yuki/body');
    const composition = resolveCharacterTemplateSelection(
      {
        Version: 1,
        canvas: { width: 1600, height: 3000 },
        components: {
          body: { src: 'body.webp', x: 12, y: -8, scale: 0.5 },
        },
        presets: {},
      },
      selector.items,
    );

    expect(selector).toEqual({ characterName: 'yuki', items: ['body'] });
    expect(composition).toEqual({
      canvas: { width: 1600, height: 3000 },
      layers: [{ name: 'body', src: 'body.webp', x: 12, y: -8, scale: 0.5 }],
    });
  });

  test.each(['../yuki/body', '%2e%2e/body', 'yuki%2Fsummer/body', 'yuki?draft/body'])(
    'rejects a character name that cannot stay inside one figure directory: %s',
    (selector) => {
      expect(() => parseCharacterSelector(selector)).toThrowError(/非法角色名/);
    },
  );

  test('expands mixed components and recursive presets in written order while preserving repeats', () => {
    const composition = resolveCharacterTemplateSelection(
      {
        Version: 1,
        canvas: { width: 1600, height: 3000 },
        components: {
          shadow: { src: 'shadow.webp', x: 0, y: 0, scale: 1 },
          body: { src: 'body.webp', x: 10, y: -20, scale: 0.5 },
          coat: { src: 'coat.webp', x: 12, y: 30, scale: 1.25 },
          face: { src: 'face.webp', x: 14, y: 40, scale: 1 },
        },
        presets: {
          dressed: ['body', 'coat'],
          speaking: ['dressed', 'face'],
        },
      },
      ['shadow', 'speaking', 'face', 'dressed'],
    );

    expect(composition.layers).toEqual([
      { name: 'shadow', src: 'shadow.webp', x: 0, y: 0, scale: 1 },
      { name: 'body', src: 'body.webp', x: 10, y: -20, scale: 0.5 },
      { name: 'coat', src: 'coat.webp', x: 12, y: 30, scale: 1.25 },
      { name: 'face', src: 'face.webp', x: 14, y: 40, scale: 1 },
      { name: 'face', src: 'face.webp', x: 14, y: 40, scale: 1 },
      { name: 'body', src: 'body.webp', x: 10, y: -20, scale: 0.5 },
      { name: 'coat', src: 'coat.webp', x: 12, y: 30, scale: 1.25 },
    ]);
  });

  test('rejects recursive preset cycles with the reference chain', () => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: {
            body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
          },
          presets: {
            first: ['body', 'second'],
            second: ['first'],
          },
        },
        ['first'],
      ),
    ).toThrowError(/循环引用.*first -> second -> first/);
  });

  test('rejects a preset whose expansion is empty', () => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: {
            body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
          },
          presets: {
            empty: [],
          },
        },
        ['empty'],
      ),
    ).toThrowError(/预设 empty.*不能为空/);
  });

  test('preserves original-size mode when component dimensions are omitted', () => {
    const composition = resolveCharacterTemplateSelection(
      {
        Version: 1,
        canvas: { width: 1600, height: 3000 },
        components: {
          body: { src: 'body.webp', x: 6, y: -9 },
        },
        presets: {},
      },
      ['body'],
    );

    expect(composition.layers).toEqual([{ name: 'body', src: 'body.webp', x: 6, y: -9 }]);
  });

  test('preserves exact width and height through direct and preset expansion', () => {
    const template: ICharacterTemplate = {
      Version: 1,
      canvas: { width: 1200, height: 1600 },
      components: {
        face: { src: 'face.webp', x: 24, y: 36, width: 320, height: 180 },
      },
      presets: {
        appearance: ['face'],
      },
    };

    const direct = resolveCharacterTemplateSelection(template, ['face']);
    const preset = resolveCharacterTemplateSelection(template, ['appearance']);

    expect(direct.layers).toEqual([{ name: 'face', src: 'face.webp', x: 24, y: 36, width: 320, height: 180 }]);
    expect(preset.layers).toEqual(direct.layers);
  });

  test('uses the selected preset canvas for a figure variant group', () => {
    const template: ICharacterTemplate = {
      Version: 1,
      canvas: { width: 1600, height: 3000 },
      components: {
        base: { src: 'base.webp', x: 0, y: 0, width: 832, height: 1216 },
        face: { src: 'face.webp', x: 80, y: 120, width: 260, height: 180 },
      },
      presets: {
        appearance_31: {
          canvas: { width: 832, height: 1216 },
          items: ['base', 'face'],
        },
      },
    };

    const composition = resolveCharacterTemplateSelection(template, ['appearance_31']);

    expect(composition.canvas).toEqual({ width: 832, height: 1216 });
    expect(composition.layers.map((layer) => layer.name)).toEqual(['base', 'face']);
  });

  test('keeps a preset facial rig in the selected composite coordinate system', () => {
    const composition = resolveCharacterTemplateSelection(
      {
        Version: 1,
        canvas: { width: 1600, height: 3000 },
        components: {
          base: { src: 'base.png', x: 0, y: 0, width: 1024, height: 1536 },
        },
        facialRig: {
          mouth: { x: 10, y: 20, width: 30, height: 40, open: 'fallback-mouth.png' },
        },
        presets: {
          live: {
            canvas: { width: 1024, height: 1536 },
            items: ['base'],
            facialRig: {
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
            },
          },
        },
      },
      ['live'],
    );

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

  test('does not inherit a top-level facial rig into a preset-specific canvas', () => {
    const composition = resolveCharacterTemplateSelection(
      {
        Version: 1,
        canvas: { width: 1600, height: 3000 },
        components: { base: { src: 'base.png', x: 0, y: 0, width: 1024, height: 1536 } },
        facialRig: { mouth: { x: 10, y: 20, width: 30, height: 40, open: 'fallback-mouth.png' } },
        presets: {
          still: { canvas: { width: 1024, height: 1536 }, items: ['base'] },
        },
      },
      ['still'],
    );

    expect(composition.facialRig).toBeUndefined();
  });

  test('uses the top-level facial rig for direct components and legacy array presets', () => {
    const template: ICharacterTemplate = {
      Version: 1,
      canvas: { width: 1024, height: 1536 },
      components: { base: { src: 'base.png', x: 0, y: 0 } },
      facialRig: { mouth: { x: 531, y: 317, width: 82, height: 73, open: 'mouth-open.png' } },
      presets: { legacy: ['base'] },
    };

    expect(resolveCharacterTemplateSelection(template, ['base']).facialRig).toEqual(template.facialRig);
    expect(resolveCharacterTemplateSelection(template, ['legacy']).facialRig).toEqual(template.facialRig);
  });

  test('rejects selecting presets with different facial rigs together', () => {
    const template: ICharacterTemplate = {
      Version: 1,
      canvas: { width: 1024, height: 1536 },
      components: { base: { src: 'base.png', x: 0, y: 0 } },
      presets: {
        talking: {
          items: ['base'],
          facialRig: { mouth: { x: 531, y: 317, width: 82, height: 73, open: 'mouth-open.png' } },
        },
        blinking: {
          items: ['base'],
          facialRig: { eyes: { x: 485, y: 228, width: 168, height: 113, closed: 'eyes-closed.png' } },
        },
      },
    };

    expect(() => resolveCharacterTemplateSelection(template, ['talking', 'blinking'])).toThrowError(
      /不能混用不同预设面部 rig/,
    );
  });

  test.each([
    [
      'outside the canvas',
      { mouth: { x: 1000, y: 1500, width: 82, height: 73, open: 'mouth-open.png' } },
      /必须完全位于组合画布内/,
    ],
    ['empty rig', {}, /至少需要 eyes 或 mouth/],
    [
      'escaping resource',
      { eyes: { x: 1, y: 2, width: 3, height: 4, closed: '../eyes-closed.png' } },
      /越出角色目录/,
    ],
  ])('rejects an invalid facial rig: %s', (_label, facialRig, expectedMessage) => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1024, height: 1536 },
          components: { base: { src: 'base.png', x: 0, y: 0 } },
          facialRig,
          presets: {},
        } as ICharacterTemplate,
        ['base'],
      ),
    ).toThrowError(expectedMessage as RegExp);
  });

  test('rejects selecting presets with different canvases together', () => {
    const template: ICharacterTemplate = {
      Version: 1,
      canvas: { width: 1600, height: 3000 },
      components: {
        body: { src: 'body.webp', x: 0, y: 0 },
      },
      presets: {
        tall: { canvas: { width: 1600, height: 3000 }, items: ['body'] },
        compact: { canvas: { width: 832, height: 1216 }, items: ['body'] },
      },
    };

    expect(() => resolveCharacterTemplateSelection(template, ['tall', 'compact'])).toThrowError(/不能混用不同预设画布/);
  });

  test('validates the canvas declared by an object preset', () => {
    const template: ICharacterTemplate = {
      Version: 1,
      canvas: { width: 1600, height: 3000 },
      components: {
        body: { src: 'body.webp', x: 0, y: 0 },
      },
      presets: {
        invalid: { canvas: { width: 0, height: 1216 }, items: ['body'] },
      },
    };

    expect(() => resolveCharacterTemplateSelection(template, ['invalid'])).toThrowError(
      /预设 invalid 的画布宽高必须是正整数/,
    );
  });

  test('rejects component resources that escape the character directory', () => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: {
            body: { src: 'parts/../../shared/body.webp', x: 0, y: 0, scale: 1 },
          },
          presets: {},
        },
        ['body'],
      ),
    ).toThrowError(/越出角色目录.*parts\/\.\.\/\.\.\/shared\/body\.webp/);
  });

  test.each([
    'https://assets.example/body.webp',
    '/shared/body.webp',
    'C:\\shared\\body.webp',
    '%2Fshared%2Fbody.webp',
  ])('rejects non-relative component resource path %s', (src) => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: {
            body: { src, x: 0, y: 0, scale: 1 },
          },
          presets: {},
        },
        ['body'],
      ),
    ).toThrowError(/路径必须相对角色目录/);
  });

  test('rejects non-integer composite canvas dimensions', () => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600.5, height: 3000 },
          components: {
            body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
          },
          presets: {},
        },
        ['body'],
      ),
    ).toThrowError(/画布宽高必须是正整数/);
  });

  test.each([
    [{ width: 8193, height: 1 }, /画布单边不能超过 8192/],
    [{ width: 4097, height: 4097 }, /画布总像素不能超过 16777216/],
  ])('rejects an unsafe composite canvas $0', (canvas, expectedMessage) => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas,
          components: {
            body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
          },
          presets: {},
        },
        ['body'],
      ),
    ).toThrowError(expectedMessage);
  });

  test('rejects component and preset names that share the same namespace entry', () => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: {
            body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
          },
          presets: {
            body: ['body'],
          },
        },
        ['body'],
      ),
    ).toThrowError(/部件与预设名称重复：body/);
  });

  test('validates every declared component before producing a composition plan', () => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: {
            body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
            broken: { src: 'broken.webp', x: Number.NaN, y: 0, scale: 1 },
          },
          presets: {},
        },
        ['body'],
      ),
    ).toThrowError(/角色部件 broken.*x、y 必须是有限数值/);
  });

  test('rejects missing references anywhere in the declared presets', () => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: {
            body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
          },
          presets: {
            broken: ['missing_face'],
          },
        },
        ['body'],
      ),
    ).toThrowError(/预设 broken 引用了不存在的部件或预设：missing_face/);
  });

  test('rejects cycles anywhere in the declared presets', () => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: {
            body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
          },
          presets: {
            first: ['second'],
            second: ['first'],
          },
        },
        ['body'],
      ),
    ).toThrowError(/循环引用.*first -> second -> first/);
  });

  test('rejects non-static component resource formats', () => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: {
            body: { src: 'parts/body.svg', x: 0, y: 0, scale: 1 },
          },
          presets: {},
        },
        ['body'],
      ),
    ).toThrowError(/静态 PNG、WebP 或 JPEG/);
  });

  test('reports a malformed top-level template as an author-facing template error', () => {
    expect(() => resolveCharacterTemplateSelection(null as unknown as ICharacterTemplate, ['body'])).toThrowError(
      new CharacterTemplateError('角色模板必须是对象'),
    );
  });

  test.each([
    ['x', { src: 'body.webp', x: Number.POSITIVE_INFINITY, y: 0, scale: 1 }, /x、y 必须是有限数值/],
    ['y', { src: 'body.webp', x: 0, y: Number.NaN, scale: 1 }, /x、y 必须是有限数值/],
    ['scale', { src: 'body.webp', x: 0, y: 0, scale: 0 }, /scale 必须是有限正数/],
    ['scale', { src: 'body.webp', x: 0, y: 0, scale: null as unknown as number }, /scale 必须是有限正数/],
  ])('rejects an invalid component %s value', (_field, component, expectedMessage) => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: { body: component },
          presets: {},
        },
        ['body'],
      ),
    ).toThrowError(expectedMessage);
  });

  test.each([
    ['only width', { src: 'body.webp', x: 0, y: 0, width: 320 }, /width、height 必须成对提供/],
    ['only height', { src: 'body.webp', x: 0, y: 0, height: 180 }, /width、height 必须成对提供/],
    [
      'mixed scale and exact dimensions',
      { src: 'body.webp', x: 0, y: 0, scale: 1, width: 320, height: 180 },
      /scale 不能与 width、height 同时提供/,
    ],
    ['zero width', { src: 'body.webp', x: 0, y: 0, width: 0, height: 180 }, /width、height 必须是有限正数/],
    ['negative height', { src: 'body.webp', x: 0, y: 0, width: 320, height: -1 }, /width、height 必须是有限正数/],
    [
      'non-finite width',
      { src: 'body.webp', x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 180 },
      /width、height 必须是有限正数/,
    ],
    ['non-finite scale', { src: 'body.webp', x: 0, y: 0, scale: Number.NaN }, /scale 必须是有限正数/],
  ])('rejects invalid component size mode: %s', (_name, component, expectedMessage) => {
    expect(() =>
      resolveCharacterTemplateSelection(
        {
          Version: 1,
          canvas: { width: 1600, height: 3000 },
          components: { body: component },
          presets: {},
        },
        ['body'],
      ),
    ).toThrowError(expectedMessage);
  });

  test('resolves an own preset whose name also exists on Object.prototype', () => {
    const composition = resolveCharacterTemplateSelection(
      {
        Version: 1,
        canvas: { width: 1600, height: 3000 },
        components: {
          body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
        },
        presets: JSON.parse('{"constructor":["body"]}') as Record<string, string[]>,
      },
      ['constructor'],
    );

    expect(composition.layers).toEqual([{ name: 'body', src: 'body.webp', x: 0, y: 0, scale: 1 }]);
  });
});
