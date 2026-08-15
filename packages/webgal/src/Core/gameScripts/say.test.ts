import { afterEach, describe, expect, test, vi } from 'vitest';
import { commandType, type ISentence } from '@/Core/controller/scene/sceneInterface';
import { WebGAL } from '@/Core/WebGAL';
import { say } from './say';
import { serializeCharacterFigureSource } from '@/Core/character/characterFigureSource';
import { initState, stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import cloneDeep from 'lodash/cloneDeep';

afterEach(() => {
  vi.restoreAllMocks();
  stageStateManager.resetCalculationStageState(cloneDeep(initState));
});

describe('say face lifecycle', () => {
  test('uses one deterministic text speech lease and releases it', () => {
    const release = vi.fn();
    const speak = vi.spyOn(WebGAL.gameplay.figureFaceRuntime, 'speak').mockReturnValue(release);
    vi.spyOn(WebGAL.gameplay.performController, 'unmountPerform').mockImplementation(() => undefined);
    stageStateManager.setFreeFigureByKey({
      key: 'hero',
      name: serializeCharacterFigureSource({ name: 'hero', items: ['live'] }),
      basePosition: 'center',
    });
    const perform = say(sentence([{ key: 'figureId', value: 'hero' }]));

    perform.startFunction?.();

    expect(speak).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledWith(
      'hero',
      expect.objectContaining({ kind: 'text', text: 'hello' }),
    );

    perform.stopFunction();
    expect(release).toHaveBeenCalledOnce();
  });

  test('does not let a face runtime failure block dialogue start', () => {
    vi.spyOn(WebGAL.gameplay.figureFaceRuntime, 'speak').mockImplementation(() => {
      throw new Error('face unavailable');
    });
    stageStateManager.setStage('figNameLeft', serializeCharacterFigureSource({ name: 'hero', items: ['live'] }));
    const perform = say(sentence([{ key: 'left', value: true }]));

    expect(() => perform.startFunction?.()).not.toThrow();
  });

  test('defaults a Character dialogue without target arguments to the center Figure', () => {
    const speak = vi.spyOn(WebGAL.gameplay.figureFaceRuntime, 'speak').mockReturnValue(() => undefined);
    stageStateManager.setStage('figName', serializeCharacterFigureSource({ name: 'hero', items: ['live'] }));
    const perform = say(sentence([]));

    perform.startFunction?.();

    expect(speak).toHaveBeenCalledWith(
      'fig-center',
      expect.objectContaining({ kind: 'text', text: 'hello' }),
    );
  });

  test('does not attach the bitmap runtime to a normal image or dynamic model target', () => {
    const speak = vi.spyOn(WebGAL.gameplay.figureFaceRuntime, 'speak');
    stageStateManager.setFreeFigureByKey({ key: 'model', name: 'model.json', basePosition: 'center' });
    const perform = say(sentence([{ key: 'figureId', value: 'model' }]));

    perform.startFunction?.();

    expect(speak).not.toHaveBeenCalled();
  });
});

function sentence(args: ISentence['args']): ISentence {
  return {
    command: commandType.say,
    commandRaw: '',
    content: 'hello',
    args,
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    isLineBreakHolder: false,
  };
}
