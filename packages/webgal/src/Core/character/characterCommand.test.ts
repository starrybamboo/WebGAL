import { afterEach, expect, test, vi } from 'vitest';
import { commandType, ISentence } from '@/Core/controller/scene/sceneInterface';
import { character } from '@/Core/gameScripts/character';
import { changeFigure } from '@/Core/gameScripts/changeFigure';
import { initState, stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { parseCharacterFigureSource } from './characterFigureSource';
import { logger } from '@/Core/util/logger';
import { baseBlinkParam, baseFocusParam } from '@/Core/live2DCore';

function sentence(content: string, args: ISentence['args'] = [], command = commandType.character): ISentence {
  return {
    command,
    commandRaw: commandType[command],
    content,
    args,
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    isLineBreakHolder: false,
  };
}

afterEach(() => {
  stageStateManager.resetCalculationStageState(initState);
  vi.restoreAllMocks();
});

test('complete character selections share Figure targets and move a same-name source atomically', () => {
  stageStateManager.resetCalculationStageState(initState);

  character(sentence('yuki/body', [{ key: 'left', value: true }]));
  character(sentence('yuki/face', [{ key: 'right', value: true }]));
  character(sentence('mika/body', [{ key: 'left', value: true }]));

  const state = stageStateManager.getCalculationStageState();
  expect(parseCharacterFigureSource(state.figNameLeft)).toEqual({ name: 'mika', items: ['body'] });
  expect(parseCharacterFigureSource(state.figNameRight)).toEqual({ name: 'yuki', items: ['face'] });
  expect(state.freeFigure).toEqual([]);
  expect('characters' in state).toBe(false);
});

test('every non-clear character command requires a complete selection and leaves state unchanged on failure', () => {
  stageStateManager.resetCalculationStageState(initState);
  const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  character(sentence('yuki/body', [{ key: 'left', value: true }]));
  const before = JSON.stringify(stageStateManager.getCalculationStageState());

  character(sentence('yuki', [{ key: 'right', value: true }]));

  expect(JSON.stringify(stageStateManager.getCalculationStageState())).toBe(before);
  expect(logError).toHaveBeenCalledWith(expect.stringMatching(/组合列表不能为空/));
});

test('default, named, explicit ID and ID-plus-position use the same target rules as changeFigure', () => {
  stageStateManager.resetCalculationStageState(initState);

  character(sentence('center/body'));
  character(sentence('left/body', [{ key: 'left', value: true }]));
  character(sentence('free/body', [{ key: 'id', value: 'figure-4' }]));
  character(
    sentence('positioned/body', [
      { key: 'id', value: 'figure-5' },
      { key: 'right', value: true },
    ]),
  );

  const state = stageStateManager.getCalculationStageState();
  expect(parseCharacterFigureSource(state.figName)).toEqual({ name: 'center', items: ['body'] });
  expect(parseCharacterFigureSource(state.figNameLeft)).toEqual({ name: 'left', items: ['body'] });
  expect(
    state.freeFigure.map((figure) => ({
      key: figure.key,
      position: figure.basePosition,
      source: parseCharacterFigureSource(figure.name),
    })),
  ).toEqual([
    { key: 'figure-4', position: 'center', source: { name: 'free', items: ['body'] } },
    { key: 'figure-5', position: 'right', source: { name: 'positioned', items: ['body'] } },
  ]);
});

test('same-ID replacement and ordinary changeFigure overwrite the previous character source naturally', () => {
  stageStateManager.resetCalculationStageState(initState);
  const targetArgs = [{ key: 'id', value: 'figure-1' }];

  character(sentence('yuki/body', targetArgs));
  character(sentence('mika/body', targetArgs));
  expect(parseCharacterFigureSource(stageStateManager.getCalculationStageState().freeFigure[0].name)).toEqual({
    name: 'mika',
    items: ['body'],
  });

  changeFigure(sentence('ordinary.webp', targetArgs, commandType.changeFigure));

  const figure = stageStateManager.getCalculationStageState().freeFigure[0];
  expect(figure.name).toBe('ordinary.webp');
  expect(parseCharacterFigureSource(figure.name)).toBeNull();
});

test('targeted and all-character clears leave ordinary Figure targets untouched', () => {
  stageStateManager.resetCalculationStageState(initState);
  character(sentence('yuki/body', [{ key: 'left', value: true }]));
  character(sentence('mika/body', [{ key: 'right', value: true }]));
  changeFigure(sentence('ordinary.webp', [{ key: 'id', value: 'ordinary' }], commandType.changeFigure));

  character(sentence('yuki', [{ key: 'clear', value: true }]));
  let state = stageStateManager.getCalculationStageState();
  expect(state.figNameLeft).toBe('');
  expect(parseCharacterFigureSource(state.figNameRight)).toEqual({ name: 'mika', items: ['body'] });
  expect(state.freeFigure.find((figure) => figure.key === 'ordinary')?.name).toBe('ordinary.webp');

  character(sentence('none'));
  state = stageStateManager.getCalculationStageState();
  expect(state.figNameRight).toBe('');
  expect(state.freeFigure.find((figure) => figure.key === 'ordinary')?.name).toBe('ordinary.webp');
});

test('character delegates static transform, animation, filter, layer and blend parameters to its Figure target', () => {
  stageStateManager.resetCalculationStageState(initState);

  const perform = character(
    sentence('yuki/body', [
      { key: 'id', value: 'figure-4' },
      { key: 'transform', value: '{"alpha":0.8,"position":{"x":12}}' },
      { key: 'ease', value: 'easeInOut' },
      { key: 'duration', value: 800 },
      { key: 'enterDuration', value: 900 },
      { key: 'exitDuration', value: 700 },
      { key: 'enter', value: 'fadeIn' },
      { key: 'exit', value: 'fadeOut' },
      { key: 'zIndex', value: 4 },
      { key: 'blendMode', value: 'multiply' },
    ]),
  );

  const state = stageStateManager.getCalculationStageState();
  expect(state.effects.find((effect) => effect.target === 'figure-4')?.transform).toMatchObject({
    alpha: 0.8,
    position: { x: 12 },
  });
  expect(state.animationSettings.find((setting) => setting.target === 'figure-4')).toMatchObject({
    enterAnimationName: 'fadeIn',
    exitAnimationName: 'fadeOut',
    enterDuration: 900,
    exitDuration: 700,
  });
  expect(state.figureMetaData['figure-4']).toEqual({ zIndex: 4, blendMode: 'multiply' });
  expect(perform).toMatchObject({ performName: 'none', duration: 0 });
  expect(perform.startFunction).toBeUndefined();
});

test('character strips Live2D and Spine-only parameters before delegating to upstream changeFigure', () => {
  stageStateManager.resetCalculationStageState(initState);

  character(
    sentence('yuki/body', [
      { key: 'id', value: 'figure-4' },
      { key: 'motion', value: 'idle' },
      { key: 'skin', value: 'summer' },
      { key: 'expression', value: 'smile' },
      { key: 'bounds', value: '1,2,3,4' },
      { key: 'blink', value: '{"interval":1000}' },
      { key: 'focus', value: '{"x":0.7,"y":-0.4}' },
    ]),
  );

  const state = stageStateManager.getCalculationStageState();
  expect(state.live2dMotion.find((item) => item.target === 'figure-4')).toEqual({
    target: 'figure-4',
    motion: '',
    skin: '',
    overrideBounds: [0, 0, 0, 0],
  });
  expect(state.live2dExpression.find((item) => item.target === 'figure-4')?.expression).toBe('');
  expect(state.live2dBlink.find((item) => item.target === 'figure-4')?.blink).toEqual(baseBlinkParam);
  expect(state.live2dFocus.find((item) => item.target === 'figure-4')?.focus).toEqual(baseFocusParam);
});
