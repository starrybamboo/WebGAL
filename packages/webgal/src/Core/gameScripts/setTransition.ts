import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { IPerform } from '@/Core/Modules/perform/performInterface';
import { webgalStore } from '@/store/store';
import cloneDeep from 'lodash/cloneDeep';
import { getBooleanArgByKey, getStringArgByKey } from '@/Core/util/getSentenceArg';
import { stageActions } from '@/store/stageReducer';
import { WebGAL } from '@/Core/WebGAL';
import { baseTransform, ITransform } from '@/store/stageInterface';
import { getEnterExitAnimation } from '@/Core/Modules/animationFunctions';

/**
 * 设置转场效果
 * @param sentence
 */
export const setTransition = (sentence: ISentence): IPerform => {
  // 根据参数设置指定位置
  let key = getStringArgByKey(sentence, 'target') ?? '0';
  const enterAnimation = getStringArgByKey(sentence, 'enter');
  const exitAnimation = getStringArgByKey(sentence, 'exit');
  const keepOffset = getBooleanArgByKey(sentence, 'keepOffset');
  if (keepOffset) {
    console.log('[setTransition] keepOffset', { target: key, enterAnimation, exitAnimation });
    const currentTransform = getCurrentTargetTransform(key);
    if (currentTransform) {
      webgalStore.dispatch(
        stageActions.updateAnimationSettings({ target: key, key: 'baseTransform', value: currentTransform }),
      );
    }
  }
  if (enterAnimation) {
    webgalStore.dispatch(
      stageActions.updateAnimationSettings({ target: key, key: 'enterAnimationName', value: enterAnimation }),
    );
  }
  if (exitAnimation) {
    webgalStore.dispatch(
      stageActions.updateAnimationSettings({ target: key, key: 'exitAnimationName', value: exitAnimation }),
    );
  }
  if (keepOffset !== null && keepOffset !== undefined) {
    webgalStore.dispatch(
      stageActions.updateAnimationSettings({ target: key, key: 'enterKeepOffset', value: keepOffset }),
    );
    webgalStore.dispatch(
      stageActions.updateAnimationSettings({ target: key, key: 'exitKeepOffset', value: keepOffset }),
    );
  }
  if (enterAnimation) {
    triggerEnterTransition(key);
  }
  return {
    performName: 'none',
    duration: 0,
    isHoldOn: false,
    stopFunction: () => {},
    blockingNext: () => false,
    blockingAuto: () => false,
    stopTimeout: undefined, // 暂时不用，后面会交给自动清除
  };
};

function triggerEnterTransition(target: string, retryCount = 0) {
  if (WebGAL.gameplay.isFast) return;
  const stageObj = WebGAL.gameplay.pixiStage?.getStageObjByKey(target);
  if (!stageObj) {
    if (retryCount < 5) {
      setTimeout(() => triggerEnterTransition(target, retryCount + 1), 50);
    }
    return;
  }
  const { duration, animation } = getEnterExitAnimation(target, 'enter');
  if (!animation || duration <= 0) return;
  const animationKey = `${target}-setTransition-enter-${Date.now()}`;
  WebGAL.gameplay.pixiStage?.stopPresetAnimationOnTarget(target);
  WebGAL.gameplay.pixiStage?.registerAnimation(animation, animationKey, target);
  setTimeout(() => {
    WebGAL.gameplay.pixiStage?.removeAnimationWithSetEffects(animationKey);
  }, duration);
}

function getCurrentTargetTransform(target: string): ITransform | null {
  const stageObj = WebGAL.gameplay.pixiStage?.getStageObjByKey(target);
  const container = stageObj?.pixiContainer;
  if (!container) {
    return null;
  }
  const transform = cloneDeep(baseTransform);
  transform.alpha = container.alpha ?? transform.alpha;
  transform.position.x = container.x ?? transform.position.x;
  transform.position.y = container.y ?? transform.position.y;
  transform.scale.x = container.scale?.x ?? transform.scale.x;
  transform.scale.y = container.scale?.y ?? transform.scale.y;
  transform.rotation = container.rotation ?? transform.rotation;
  console.log('[setTransition] baseTransform', { target, position: transform.position, scale: transform.scale });
  return transform;
}
