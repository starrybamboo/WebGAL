import cloneDeep from 'lodash/cloneDeep';
import { expect, test } from 'vitest';
import { figureStateKeyByPosition, type IStageState } from '@/Core/Modules/stage/stageInterface';
import { initState, StageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { CharacterFigureService } from './characterFigureService';
import { CharacterFigureSourceSync } from './characterFigureSourceSync';
import {
  collectCharacterFigureTargets,
  parseCharacterFigureSource,
  serializeCharacterFigureSource,
  type ICharacterFigureTarget,
} from './characterFigureSource';

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

test('a cache-miss restore commits a serializable Figure source and continues before composition', async () => {
  const composition = createDeferred<string>();
  const events: string[] = [];
  const service = new CharacterFigureService({
    getTemplateUrl: (name) => `./game/figure/${name}/figure.json`,
    loadTemplate: async () => template,
    compose: async () => composition.promise,
  });
  const sync = new CharacterFigureSourceSync(service, {
    replaceFigure: () => events.push('delivered'),
    removeFigure: () => undefined,
    hasFigure: () => false,
  });
  const manager = createRestoringStageManager(sync);
  const restoredState = createStageState([yukiBody]);
  restoredState.effects.push({ target: yukiBody.key, transform: { alpha: 0.8 } });
  restoredState.animationSettings.push({
    target: yukiBody.key,
    enterAnimationName: 'enter-from-left',
    enterDuration: 250,
  });
  restoredState.figureMetaData[yukiBody.key] = { zIndex: 7, blendMode: 'multiply' };

  manager.replaceAllStageState(restoredState);
  events.push('continued');

  expect(events).toEqual(['continued']);
  expect(parseCharacterFigureSource(manager.getViewStageState().figNameLeft)).toEqual(yukiBody.source);
  expect(manager.getViewStageState().animationSettings).toContainEqual({
    target: yukiBody.key,
    enterAnimationName: 'enter-from-left',
    enterDuration: 250,
  });
  expect(manager.getViewStageState().figureMetaData[yukiBody.key]).toEqual({
    zIndex: 7,
    blendMode: 'multiply',
  });
  const serializedState = JSON.stringify(manager.getViewStageState());
  expect(serializedState).toContain('webgal-character-source');
  expect(serializedState).not.toContain('data:image');
  expect(serializedState).not.toContain('"characters"');

  composition.resolve('data:image/png;base64,yuki-body');
  await flushAsyncWork();

  expect(events).toEqual(['continued', 'delivered']);
  expect(JSON.stringify(manager.getViewStageState())).not.toContain('data:image');
});

test('a cache-hit restore remains asynchronous and reuses the prepared image', async () => {
  let templateLoads = 0;
  let compositions = 0;
  const events: string[] = [];
  const service = new CharacterFigureService({
    getTemplateUrl: (name) => `./game/figure/${name}/figure.json`,
    loadTemplate: async () => {
      templateLoads += 1;
      return template;
    },
    compose: async () => {
      compositions += 1;
      return 'data:image/png;base64,yuki-body';
    },
  });
  await service.prepare(yukiBody.source);
  const sync = new CharacterFigureSourceSync(service, {
    replaceFigure: () => events.push('delivered'),
    removeFigure: () => undefined,
    hasFigure: () => false,
  });
  const manager = createRestoringStageManager(sync);

  manager.replaceAllStageState(createStageState([yukiBody]));
  events.push('continued');

  expect(events).toEqual(['continued']);
  await flushAsyncWork();
  expect(events).toEqual(['continued', 'delivered']);
  expect(templateLoads).toBe(1);
  expect(compositions).toBe(1);
});

test('one character failing during restore does not block another character or game progression', async () => {
  const events: string[] = [];
  const errors: string[] = [];
  const service = new CharacterFigureService({
    getTemplateUrl: (name) => `./game/figure/${name}/figure.json`,
    loadTemplate: async () => template,
    compose: async (_composition, context) => {
      if (context.characterName === 'yuki') {
        throw new Error('missing body image');
      }
      return `data:image/png;base64,${context.characterName}`;
    },
  });
  const sync = new CharacterFigureSourceSync(service, {
    replaceFigure: ({ key }) => events.push(`delivered:${key}`),
    removeFigure: () => undefined,
    hasFigure: () => false,
    reportError: (message) => errors.push(message),
  });
  const manager = createRestoringStageManager(sync);
  const alice: ICharacterFigureTarget = {
    key: 'fig-right',
    position: 'right',
    source: { name: 'alice', items: ['body'] },
  };

  manager.replaceAllStageState(createStageState([yukiBody, alice]));
  events.push('continued');

  expect(events).toEqual(['continued']);
  await flushAsyncWork();
  expect(events).toEqual(['continued', 'delivered:fig-right']);
  expect(errors).toEqual(['角色 yuki 的组合图片准备失败']);
  expect(collectCharacterFigureTargets(manager.getViewStageState())).toEqual([yukiBody, alice]);
});

test('a newer restored Figure source invalidates an older async result for the same target', async () => {
  const compositions = new Map<string, ReturnType<typeof createDeferred<string>>>();
  const delivered: string[] = [];
  const service = new CharacterFigureService({
    getTemplateUrl: (name) => `./game/figure/${name}/figure.json`,
    loadTemplate: async () => template,
    compose: async (composition) => {
      const selection = composition.layers.map((layer) => layer.name).join(',');
      const result = createDeferred<string>();
      compositions.set(selection, result);
      return result.promise;
    },
  });
  const sync = new CharacterFigureSourceSync(service, {
    replaceFigure: ({ sourceUrl }) => delivered.push(sourceUrl),
    removeFigure: () => undefined,
    hasFigure: () => false,
  });
  const manager = createRestoringStageManager(sync);

  manager.replaceAllStageState(createStageState([yukiBody]));
  await flushAsyncWork();
  const yukiFace = { ...yukiBody, source: { ...yukiBody.source, items: ['face'] } };
  manager.replaceAllStageState(createStageState([yukiFace]));
  await flushAsyncWork();

  compositions.get('face')?.resolve('data:image/png;base64,face');
  await flushAsyncWork();
  compositions.get('body')?.resolve('data:image/png;base64,body');
  await flushAsyncWork();

  expect(delivered).toEqual(['data:image/png;base64,face']);
  expect(parseCharacterFigureSource(manager.getViewStageState().figNameLeft)?.items).toEqual(['face']);
});

function createRestoringStageManager(sync: CharacterFigureSourceSync): StageStateManager {
  const manager = new StageStateManager();
  manager.setCommitHandler((stageState) => sync.sync(collectCharacterFigureTargets(stageState)));
  return manager;
}

function createStageState(targets: ICharacterFigureTarget[]): IStageState {
  const stageState = cloneDeep(initState);
  for (const target of targets) {
    const serializedSource = serializeCharacterFigureSource(target.source);
    if (target.key === `fig-${target.position}`) {
      stageState[figureStateKeyByPosition[target.position]] = serializedSource;
    } else {
      stageState.freeFigure.push({ key: target.key, basePosition: target.position, name: serializedSource });
    }
  }
  return stageState;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
