import cloneDeep from 'lodash/cloneDeep';
import { expect, test } from 'vitest';
import { initState, StageStateManager } from './stageStateManager';

test('restoring a legacy stage snapshot normalizes missing character state', () => {
  const legacyStageState = cloneDeep(initState) as Partial<typeof initState>;
  delete legacyStageState.characters;
  const manager = new StageStateManager();

  manager.replaceAllStageState(legacyStageState as typeof initState);

  expect(manager.getCalculationStageState().characters).toEqual([]);
  expect(manager.getViewStageState().characters).toEqual([]);
});
