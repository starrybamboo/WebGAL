import { expect, test, vi } from 'vitest';
import { initState, stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { syncPixiStageState } from '@/Core/controller/stage/pixi/syncPixiStageState';
import { WebGAL } from '@/Core/WebGAL';
import SceneParser, { ADD_NEXT_ARG_LIST, SCRIPT_CONFIG } from '../../../../parser/src';
import { changeFigure } from '@/Core/gameScripts/changeFigure';
import { commandType, ISentence } from '@/Core/controller/scene/sceneInterface';

test('changeFigure statements keep ordinary image, Live2D and Spine Pixi routing', () => {
  const delivered: Array<{ type: string; key: string; url: string }> = [];
  const previousPixiStage = WebGAL.gameplay.pixiStage;
  stageStateManager.resetCalculationStageState(initState);
  const parser = new SceneParser(
    () => undefined,
    (fileName) => `./game/figure/${fileName}`,
    ADD_NEXT_ARG_LIST,
    SCRIPT_CONFIG,
  );
  const scene = parser.parse(
    [
      'changeFigure:legacy.png -left -id=legacy-image;',
      'changeFigure:legacy.json -center -id=legacy-live2d;',
      'changeFigure:legacy.skel -right -id=legacy-spine;',
    ].join('\n'),
    'compatibility',
    'compatibility.txt',
  );
  expect(scene.sentenceList.map((sentence) => sentence.command)).toEqual([
    commandType.changeFigure,
    commandType.changeFigure,
    commandType.changeFigure,
  ]);
  scene.sentenceList.forEach((sentence) => changeFigure(sentence as unknown as ISentence));

  vi.stubGlobal('window', { location: { origin: 'https://game.example' } });
  WebGAL.gameplay.pixiStage = {
    getStageObjByKey: () => undefined,
    getFigureObjects: () => [],
    addFigure: (key: string, url: string) => delivered.push({ type: 'image', key, url }),
    addLive2dFigure: (key: string, url: string) => delivered.push({ type: 'live2d', key, url }),
    addSpineFigure: (key: string, url: string) => delivered.push({ type: 'spine', key, url }),
    changeModelMotionByKey: () => undefined,
    changeModelExpressionByKey: () => undefined,
    changeModelBlinkByKey: () => undefined,
    changeModelFocusByKey: () => undefined,
  } as unknown as typeof WebGAL.gameplay.pixiStage;

  try {
    syncPixiStageState(
      stageStateManager.getCalculationStageState(),
      { syncPixiStage: true, applyPixiEffects: false, notifyReact: false, skipAnimation: true },
    );
  } finally {
    WebGAL.gameplay.pixiStage = previousPixiStage;
    stageStateManager.resetCalculationStageState(initState);
    vi.unstubAllGlobals();
  }

  expect(delivered).toEqual([
    { type: 'image', key: 'legacy-image', url: './game/figure/legacy.png' },
    { type: 'live2d', key: 'legacy-live2d', url: './game/figure/legacy.json' },
    { type: 'spine', key: 'legacy-spine', url: './game/figure/legacy.skel' },
  ]);
});
