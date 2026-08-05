import { expect, test } from 'vitest';
import { CharacterFigureService } from './characterFigureService';
import { CharacterFigureSourceSync } from './characterFigureSourceSync';
import type { ICharacterFigureTarget } from './characterFigureSource';

const yukiBody: ICharacterFigureTarget = {
  key: 'fig-left',
  position: 'left',
  source: { name: 'yuki', items: ['body'] },
};

const template = {
  Version: 1 as const,
  canvas: { width: 1600, height: 3000 },
  components: {
    body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
    face: { src: 'face.webp', x: 0, y: 0, scale: 1 },
  },
  presets: {},
};

test('concurrent and later identical requests reuse one successful composition', async () => {
  let templateLoads = 0;
  let compositions = 0;
  let finishComposition: (sourceUrl: string) => void = () => undefined;
  const compositionReady = new Promise<string>((resolve) => {
    finishComposition = resolve;
  });
  const service = new CharacterFigureService({
    getTemplateUrl: () => './game/figure/yuki/figure.json',
    loadTemplate: async () => {
      templateLoads += 1;
      return template;
    },
    compose: async () => {
      compositions += 1;
      return compositionReady;
    },
  });

  const first = service.prepare(yukiBody.source);
  const second = service.prepare(yukiBody.source);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(templateLoads).toBe(1);
  expect(compositions).toBe(1);

  finishComposition('data:image/png;base64,yuki-body');
  await expect(Promise.all([first, second])).resolves.toEqual([
    'data:image/png;base64,yuki-body',
    'data:image/png;base64,yuki-body',
  ]);
  await expect(service.prepare(yukiBody.source)).resolves.toBe('data:image/png;base64,yuki-body');
  expect(templateLoads).toBe(1);
  expect(compositions).toBe(1);
});

test('a failed composition can be retried', async () => {
  let compositions = 0;
  const service = new CharacterFigureService({
    getTemplateUrl: () => './game/figure/yuki/figure.json',
    loadTemplate: async () => template,
    compose: async () => {
      compositions += 1;
      if (compositions === 1) {
        throw new Error('image missing');
      }
      return 'data:image/png;base64,retried';
    },
  });

  await expect(service.prepare(yukiBody.source)).rejects.toThrow('image missing');
  await expect(service.prepare(yukiBody.source)).resolves.toBe('data:image/png;base64,retried');
  expect(compositions).toBe(2);
});

test('an invalid template is not cached and can be reloaded after correction', async () => {
  let templateLoads = 0;
  const service = new CharacterFigureService({
    getTemplateUrl: () => './game/figure/yuki/figure.json',
    loadTemplate: async () => {
      templateLoads += 1;
      return templateLoads === 1 ? { ...template, Version: 2 } : template;
    },
    compose: async () => 'data:image/png;base64,corrected-template',
  });

  await expect(service.prepare(yukiBody.source)).rejects.toThrow('不支持的角色模板版本');
  await expect(service.prepare(yukiBody.source)).resolves.toBe('data:image/png;base64,corrected-template');
  expect(templateLoads).toBe(2);
});

test('an older request finishing last cannot replace the latest character image', async () => {
  const finishes = new Map<string, (sourceUrl: string) => void>();
  const service = new CharacterFigureService({
    getTemplateUrl: () => './game/figure/yuki/figure.json',
    loadTemplate: async () => template,
    compose: async (composition) =>
      new Promise<string>((resolve) => {
        finishes.set(composition.layers.map((layer) => layer.name).join(','), resolve);
      }),
  });
  const delivered: string[] = [];
  const stageSync = new CharacterFigureSourceSync(service, {
    replaceFigure: ({ sourceUrl }) => delivered.push(sourceUrl),
    removeFigure: () => undefined,
  });

  stageSync.sync([yukiBody]);
  stageSync.sync([{ ...yukiBody, source: { ...yukiBody.source, items: ['face'] } }]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  finishes.get('face')?.('data:image/png;base64,face');
  await new Promise((resolve) => setTimeout(resolve, 0));
  finishes.get('body')?.('data:image/png;base64,body');
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(delivered).toEqual(['data:image/png;base64,face']);
});

test('a visible request starts before an unstarted prewarm task', async () => {
  const scheduledTasks: Array<() => void> = [];
  const compositionOrder: string[] = [];
  const service = new CharacterFigureService({
    getTemplateUrl: () => './game/figure/yuki/figure.json',
    loadTemplate: async () => template,
    compose: async (composition) => {
      const key = composition.layers.map((layer) => layer.name).join(',');
      compositionOrder.push(key);
      return `data:image/png;base64,${key}`;
    },
    schedulePrewarm: (task) => {
      scheduledTasks.push(task);
      return () => undefined;
    },
  });

  service.prewarm(yukiBody.source);
  await expect(service.prepare({ ...yukiBody.source, items: ['face'] })).resolves.toBe('data:image/png;base64,face');
  expect(compositionOrder).toEqual(['face']);

  scheduledTasks[0]?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(compositionOrder).toEqual(['face', 'body']);
});

test('a visible request reuses the same task after its prewarm has started', async () => {
  const scheduledTasks: Array<() => void> = [];
  let compositions = 0;
  let finishComposition: (sourceUrl: string) => void = () => undefined;
  const compositionReady = new Promise<string>((resolve) => {
    finishComposition = resolve;
  });
  const service = new CharacterFigureService({
    getTemplateUrl: () => './game/figure/yuki/figure.json',
    loadTemplate: async () => template,
    compose: async () => {
      compositions += 1;
      return compositionReady;
    },
    schedulePrewarm: (task) => {
      scheduledTasks.push(task);
      return () => undefined;
    },
  });

  service.prewarm(yukiBody.source);
  scheduledTasks[0]?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const visibleRequest = service.prepare(yukiBody.source);

  expect(compositions).toBe(1);
  finishComposition('data:image/png;base64,shared-prewarm');
  await expect(visibleRequest).resolves.toBe('data:image/png;base64,shared-prewarm');
  expect(compositions).toBe(1);
});
