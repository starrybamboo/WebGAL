import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { IPerform } from '@/Core/Modules/perform/performInterface';
import { getBooleanArgByKey } from '@/Core/util/getSentenceArg';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';

export const dicePerform = (sentence: ISentence): IPerform => {
  const clear = getBooleanArgByKey(sentence, 'clear') ?? false;
  const content = clear ? '' : String(sentence.content ?? '');
  const visible = !!content.trim();

  stageStateManager.setStage('dicePerform', {
    visible,
    content,
    revision: Date.now(),
  });

  if (visible) {
    stageStateManager.setStage('showText', '');
    stageStateManager.setStage('showName', '');
    stageStateManager.setStage('currentConcatDialogPrev', '');
  }

  return {
    performName: 'none',
    duration: 0,
    isHoldOn: false,
    stopFunction: () => {},
    blockingNext: () => false,
    blockingAuto: () => true,
  };
};
