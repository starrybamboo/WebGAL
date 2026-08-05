import cloneDeep from 'lodash/cloneDeep';
import { expect, test } from 'vitest';
import { parseCharacterFigureSource, serializeCharacterFigureSource } from '@/Core/character/characterFigureSource';
import { initState, StageStateManager } from './stageStateManager';

test('restoring a stage snapshot keeps a serializable character source on its Figure target', () => {
  const restoredState = cloneDeep(initState);
  restoredState.figName = serializeCharacterFigureSource({ name: 'yuki', items: ['body', 'face'] });
  const manager = new StageStateManager();

  manager.replaceAllStageState(restoredState);

  expect(parseCharacterFigureSource(manager.getCalculationStageState().figName)).toEqual({
    name: 'yuki',
    items: ['body', 'face'],
  });
  expect('characters' in manager.getCalculationStageState()).toBe(false);
});
