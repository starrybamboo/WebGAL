import { beforeEach, expect, test, vi } from 'vitest';
import { commandType, type ISentence } from '@/Core/controller/scene/sceneInterface';
import { initState, stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { changeFigure } from './changeFigure';
import { syncPixiStageState } from '@/Core/controller/stage/pixi/syncPixiStageState';
import { WebGAL } from '@/Core/WebGAL';
import type { IStageObject } from '@/Core/controller/stage/pixi/PixiController';
import cloneDeep from 'lodash/cloneDeep';
import { characterFigureService } from '@/Core/character/characterFigureService';
import { serializeCharacterFigureSource } from '@/Core/character/characterFigureSource';

function sentence(content: string, args: ISentence['args']): ISentence {
  return {
    command: commandType.changeFigure,
    commandRaw: 'changeFigure',
    content,
    args,
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    isLineBreakHolder: false,
  };
}

beforeEach(() => {
  stageStateManager.resetCalculationStageState(initState);
});

test('same-ID Figure position and explicit bounds changes replace the Figure identity', () => {
  const id = { key: 'id', value: 'hero' } as const;

  changeFigure(sentence('hero.json', [id, { key: 'left', value: true }, { key: 'bounds', value: '1,2,3,4' }]));
  const motionOnly = changeFigure(
    sentence('hero.json', [id, { key: 'left', value: true }, { key: 'motion', value: 'wave' }]),
  );

  expect(motionOnly.performName).toBe('enter-hero');
  expect(
    stageStateManager.getCalculationStageState().live2dMotion.find((item) => item.target === 'hero'),
  ).toMatchObject({
    motion: 'wave',
    overrideBounds: [1, 2, 3, 4],
  });

  const moved = changeFigure(sentence('hero.json', [id, { key: 'right', value: true }]));
  expect(moved.performName).toBe('animation-hero');
  expect(
    stageStateManager.getCalculationStageState().freeFigure.find((item) => item.key === 'hero')?.basePosition,
  ).toBe('right');

  const resized = changeFigure(
    sentence('hero.json', [id, { key: 'right', value: true }, { key: 'bounds', value: '5,6,7,8' }]),
  );
  expect(resized.performName).toBe('animation-hero');
  expect(
    stageStateManager.getCalculationStageState().live2dMotion.find((item) => item.target === 'hero')?.overrideBounds,
  ).toEqual([5, 6, 7, 8]);
});

test('Pixi sync recreates a same-URL Figure when its base position identity changes', () => {
  const previousPixiStage = WebGAL.gameplay.pixiStage;
  const addedPositions: string[] = [];
  const releasedFigureUuids: string[] = [];
  const oldFigure = {
    uuid: 'old-hero-uuid',
    key: 'hero',
    sourceUrl: 'hero.png',
    figureIdentity: JSON.stringify(['hero.png', 'left', [0, 0, 0, 0]]),
    pixiContainer: null,
  } as unknown as IStageObject;
  let currentFigure: IStageObject | undefined = oldFigure;

  WebGAL.gameplay.pixiStage = {
    getStageObjByKey: (key: string) => (currentFigure?.key === key ? currentFigure : undefined),
    getFigureObjects: () => (currentFigure ? [currentFigure] : []),
    removeAnimation: () => undefined,
    releaseFigureFaceByUuid: (figureUuid: string) => releasedFigureUuids.push(figureUuid),
    removeStageObjectByKey: (key: string) => {
      if (currentFigure?.key === key) currentFigure = undefined;
    },
    addFigure: (key: string, sourceUrl: string, position: string) => {
      addedPositions.push(position);
      currentFigure = { key, sourceUrl, pixiContainer: null } as unknown as IStageObject;
    },
    changeModelMotionByKey: () => undefined,
    changeModelExpressionByKey: () => undefined,
    changeModelBlinkByKey: () => undefined,
    changeModelFocusByKey: () => undefined,
  } as unknown as typeof WebGAL.gameplay.pixiStage;

  try {
    const state = cloneDeep(initState);
    state.freeFigure.push({ key: 'hero', name: 'hero.png', basePosition: 'right' });
    syncPixiStageState(state, {
      syncPixiStage: true,
      applyPixiEffects: false,
      notifyReact: false,
      skipAnimation: true,
    });
  } finally {
    WebGAL.gameplay.pixiStage = previousPixiStage;
  }

  expect(oldFigure.isExiting).toBe(true);
  expect(releasedFigureUuids).toEqual(['old-hero-uuid']);
  expect(addedPositions).toEqual(['right']);
  expect(currentFigure?.figureIdentity).toBe(JSON.stringify(['hero.png', 'right', [0, 0, 0, 0]]));
});

test('Character replacement releases the old bitmap face instance before reusing its logical key', async () => {
  const previousPixiStage = WebGAL.gameplay.pixiStage;
  const previousFastPreview = WebGAL.gameplay.isFastPreview;
  const key = 'face-binding-character';
  const releaseEvents: Array<{ uuid: string; key: string | undefined }> = [];
  const additions: Array<{ key: string; sourceUrl: string; facialRig: unknown }> = [];
  const facialRig = {
    mouth: { x: 10, y: 20, width: 30, height: 15, openUrl: './game/figure/hero/mouth-open.png' },
  };
  let currentFigure: IStageObject | undefined = {
    uuid: 'old-character-uuid',
    key,
    sourceUrl: 'data:image/png;base64,old-character',
    sourceExt: 'png',
    sourceType: 'img',
    pixiContainer: null,
  };
  const prepareFigure = vi.spyOn(characterFigureService, 'prepareFigure').mockResolvedValue({
    sourceUrl: 'data:image/png;base64,new-character',
    facialRig,
  });

  WebGAL.gameplay.isFastPreview = true;
  WebGAL.gameplay.pixiStage = {
    getStageObjByKey: (target: string) => (currentFigure?.key === target ? currentFigure : undefined),
    getFigureObjects: () => (currentFigure ? [currentFigure] : []),
    removeAnimation: () => undefined,
    releaseFigureFaceByUuid: (figureUuid: string) => {
      releaseEvents.push({ uuid: figureUuid, key: currentFigure?.key });
    },
    removeStageObjectByKey: (target: string) => {
      if (currentFigure?.key === target) currentFigure = undefined;
    },
    addFigure: (target: string, sourceUrl: string, _position: string, receivedFacialRig: unknown) => {
      additions.push({ key: target, sourceUrl, facialRig: receivedFacialRig });
      currentFigure = {
        uuid: 'new-character-uuid',
        key: target,
        sourceUrl,
        sourceExt: 'png',
        sourceType: 'img',
        pixiContainer: null,
      };
    },
    changeModelMotionByKey: () => undefined,
    changeModelExpressionByKey: () => undefined,
    changeModelBlinkByKey: () => undefined,
    changeModelFocusByKey: () => undefined,
  } as unknown as typeof WebGAL.gameplay.pixiStage;

  try {
    const state = cloneDeep(initState);
    state.freeFigure.push({
      key,
      name: serializeCharacterFigureSource({ name: 'face-binding-hero', items: ['default'] }),
      basePosition: 'center',
    });
    syncPixiStageState(state, {
      syncPixiStage: true,
      applyPixiEffects: false,
      notifyReact: false,
      skipAnimation: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(releaseEvents).toEqual([{ uuid: 'old-character-uuid', key }]);
    expect(additions).toEqual([{ key, sourceUrl: 'data:image/png;base64,new-character', facialRig }]);
  } finally {
    // 清掉模块级 Character source sync 的目标，避免把本测试状态带到其他用例。
    syncPixiStageState(cloneDeep(initState), {
      syncPixiStage: true,
      applyPixiEffects: false,
      notifyReact: false,
      skipAnimation: true,
    });
    prepareFigure.mockRestore();
    WebGAL.gameplay.pixiStage = previousPixiStage;
    WebGAL.gameplay.isFastPreview = previousFastPreview;
  }
});
