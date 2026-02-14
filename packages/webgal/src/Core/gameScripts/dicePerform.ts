import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { IPerform } from '@/Core/Modules/perform/performInterface';
import { getBooleanArgByKey, getStringArgByKey } from '@/Core/util/getSentenceArg';
import { webgalStore } from '@/store/store';
import { setStage } from '@/store/stageReducer';

export const dicePerform = (sentence: ISentence): IPerform => {
  const dispatch = webgalStore.dispatch;
  const mode = (getStringArgByKey(sentence, 'mode') ?? '').trim().toLowerCase();
  const clear = getBooleanArgByKey(sentence, 'clear') ?? false;
  const content = clear ? '' : String(sentence.content ?? '');
  const visible = !!content.trim();

  dispatch(
    setStage({
      key: 'dicePerform',
      value: {
        visible,
        content,
        mode,
        revision: Date.now(),
      },
    }),
  );

  if (visible) {
    dispatch(setStage({ key: 'showText', value: '' }));
    dispatch(setStage({ key: 'showName', value: '' }));
    dispatch(setStage({ key: 'currentConcatDialogPrev', value: '' }));
  }

  return {
    performName: 'none',
    duration: 0,
    isHoldOn: false,
    stopFunction: () => {},
    blockingNext: () => false,
    blockingAuto: () => true,
    stopTimeout: undefined,
  };
};
