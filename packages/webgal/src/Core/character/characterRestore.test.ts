import cloneDeep from 'lodash/cloneDeep';
import { expect, test } from 'vitest';
import type { IStageCharacter, IStageState } from '@/Core/Modules/stage/stageInterface';
import { initState, StageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { CharacterFigureService } from './characterFigureService';
import { CharacterStageSync } from './characterStageSync';

const yukiBody: IStageCharacter = {
  name: 'yuki',
  key: 'character-yuki',
  items: ['body'],
  position: 'left',
};

const template = {
  Version: 1,
  canvas: { width: 1600, height: 3000 },
  components: {
    body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
    face: { src: 'face.webp', x: 0, y: 0, scale: 1 },
  },
  presets: {},
};

test('a cache-miss restore commits serializable character state and continues before composition', async () => {
  const composition = createDeferred<string>();
  const events: string[] = [];
  const service = new CharacterFigureService({
    getTemplateUrl: (name) => `./game/figure/${name}/figure.json`,
    loadTemplate: async () => template,
    compose: async () => composition.promise,
  });
  const sync = new CharacterStageSync(service, {
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
  expect(manager.getViewStageState().characters).toEqual([yukiBody]);
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
  expect(JSON.parse(serializedState).characters).toEqual([yukiBody]);
  expect(serializedState).not.toContain('data:image');

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
  await service.prepare(yukiBody);
  const sync = new CharacterStageSync(service, {
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
  const sync = new CharacterStageSync(service, {
    replaceFigure: ({ key }) => events.push(`delivered:${key}`),
    removeFigure: () => undefined,
    hasFigure: () => false,
    reportError: (message) => errors.push(message),
  });
  const manager = createRestoringStageManager(sync);
  const alice: IStageCharacter = {
    name: 'alice',
    key: 'character-alice',
    items: ['body'],
    position: 'right',
  };

  manager.replaceAllStageState(createStageState([yukiBody, alice]));
  events.push('continued');

  expect(events).toEqual(['continued']);
  await flushAsyncWork();
  expect(events).toEqual(['continued', 'delivered:character-alice']);
  expect(errors).toEqual(['角色 yuki 的组合图片准备失败']);
  expect(manager.getViewStageState().characters).toEqual([yukiBody, alice]);
});

test('a newer restore request invalidates the older result for the same character', async () => {
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
  const sync = new CharacterStageSync(service, {
    replaceFigure: ({ sourceUrl }) => delivered.push(sourceUrl),
    removeFigure: () => undefined,
    hasFigure: () => false,
  });
  const manager = createRestoringStageManager(sync);

  manager.replaceAllStageState(createStageState([yukiBody]));
  await flushAsyncWork();
  manager.replaceAllStageState(createStageState([{ ...yukiBody, items: ['face'] }]));
  await flushAsyncWork();

  compositions.get('face')?.resolve('data:image/png;base64,face');
  await flushAsyncWork();
  compositions.get('body')?.resolve('data:image/png;base64,body');
  await flushAsyncWork();

  expect(delivered).toEqual(['data:image/png;base64,face']);
  expect(manager.getViewStageState().characters[0].items).toEqual(['face']);
});

function createRestoringStageManager(sync: CharacterStageSync): StageStateManager {
  const manager = new StageStateManager();
  manager.setCommitHandler((stageState) => sync.sync(stageState.characters));
  return manager;
}

function createStageState(characters: IStageCharacter[]): IStageState {
  const stageState = cloneDeep(initState);
  stageState.characters = cloneDeep(characters);
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
