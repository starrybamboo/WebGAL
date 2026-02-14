import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { IPerform } from '@/Core/Modules/perform/performInterface';
import { getBooleanArgByKey, getStringArgByKey } from '@/Core/util/getSentenceArg';
import PixiStage, { IAnimationObject } from '@/Core/controller/stage/pixi/PixiController';
import { logger } from '@/Core/util/logger';
import { webgalStore } from '@/store/store';
import { stageActions } from '@/store/stageReducer';

import { getAnimateDuration, getAnimationObject } from '@/Core/Modules/animationFunctions';
import { WebGAL } from '@/Core/WebGAL';
import cloneDeep from 'lodash/cloneDeep';
import { baseTransform, ITransform } from '@/store/stageInterface';

const pendingRestoreOnNextMap = new Map<string, () => void>();

/**
 * 设置背景动画
 * @param sentence
 */
export const setAnimation = (sentence: ISentence): IPerform => {
  const animationName = sentence.content;
  const animationDuration = getAnimateDuration(animationName);
  let target = getStringArgByKey(sentence, 'target') ?? '';
  target = target !== '' ? target : 'default_id';
  const writeDefault = getBooleanArgByKey(sentence, 'writeDefault') ?? false;
  const keepOffset = getBooleanArgByKey(sentence, 'keepOffset') ?? false;
  const restoreTransform = getBooleanArgByKey(sentence, 'restoreTransform') ?? false;
  const restoreOnNext = getBooleanArgByKey(sentence, 'restoreOnNext') ?? true;
  const keep = getBooleanArgByKey(sentence, 'keep') ?? false;

  const key = `${target}-${animationName}-${animationDuration}`;
  const performInitName = `animation-${target}`;

  WebGAL.gameplay.performController.unmountPerform(performInitName, true);

  let stopFunction;
  let baseTransformOverride: ITransform | undefined;
  setTimeout(() => {
    const oldPending = pendingRestoreOnNextMap.get(target);
    if (oldPending) {
      WebGAL.events.userInteractNext.off(oldPending);
      pendingRestoreOnNextMap.delete(target);
    }
    WebGAL.gameplay.pixiStage?.stopPresetAnimationOnTarget(target);
    const baseTransformFromSetting = keepOffset ? getBaseTransformFromSettings(target) : undefined;
    const currentTargetTransform = keepOffset ? getCurrentTargetTransform(target) : undefined;
    const effectTargetTransform = keepOffset ? getTargetEffectTransform(target) : undefined;
    // keepOffset/restoreTransform 需要稳定基准，优先使用 changeFigure 记录的 baseTransform，
    // 避免用户快速切句时采样到上一动作的中间帧，导致位移累计。
    baseTransformOverride = keepOffset
      ? baseTransformFromSetting ?? currentTargetTransform ?? effectTargetTransform ?? undefined
      : undefined;
    let baseSource = 'disabled';
    if (keepOffset) {
      if (baseTransformFromSetting) {
        baseSource = 'animationSettings.baseTransform';
      } else if (currentTargetTransform) {
        baseSource = 'currentTargetTransform';
      } else if (effectTargetTransform) {
        baseSource = 'stage.effects.transform';
      } else {
        baseSource = 'none';
      }
    }
    console.log('[setAnimation][start]', {
      animationName,
      target,
      keepOffset,
      restoreTransform,
      restoreOnNext,
      writeDefault,
      duration: animationDuration,
      baseSource,
      baseFromSetting: baseTransformFromSetting?.position,
      currentTransform: currentTargetTransform?.position,
      effectTransform: effectTargetTransform?.position,
      selectedBase: baseTransformOverride?.position,
      key,
    });
    const animationObj: IAnimationObject | null = getAnimationObject(
      animationName,
      target,
      animationDuration,
      writeDefault,
      keepOffset,
      baseTransformOverride ?? undefined,
    );
    if (animationObj) {
      logger.debug(`动画${animationName}作用在${target}`, animationDuration);
      console.log('[setAnimation][register]', {
        animationName,
        target,
        duration: animationDuration,
        keepOffset,
        restoreTransform,
        restoreOnNext,
        key,
      });
      WebGAL.gameplay.pixiStage?.registerAnimation(animationObj, key, target);
    } else {
      console.log('[setAnimation][register-skip]', {
        animationName,
        target,
        duration: animationDuration,
        keepOffset,
        restoreTransform,
        restoreOnNext,
        key,
      });
    }
  }, 0);
  stopFunction = () => {
    setTimeout(() => {
      if (restoreTransform && baseTransformOverride) {
        // 临时动作不应该把位移终态持久化到后续演出。
        WebGAL.gameplay.pixiStage?.removeAnimationWithoutSetEndState(key);
        const applyRestore = () => {
          const targetObj = WebGAL.gameplay.pixiStage?.getStageObjByKey(target);
          if (targetObj?.pixiContainer) {
            PixiStage.assignTransform(targetObj.pixiContainer, baseTransformOverride!);
          }
          webgalStore.dispatch(stageActions.updateEffect({ target, transform: cloneDeep(baseTransformOverride!) }));
          console.log('[setAnimation][stop-restore]', {
            animationName,
            target,
            key,
            restoredPosition: baseTransformOverride!.position,
          });
        };
        if (restoreOnNext) {
          const oldPending = pendingRestoreOnNextMap.get(target);
          if (oldPending) {
            WebGAL.events.userInteractNext.off(oldPending);
            pendingRestoreOnNextMap.delete(target);
          }
          const restoreOnUserNext = () => {
            WebGAL.events.userInteractNext.off(restoreOnUserNext);
            pendingRestoreOnNextMap.delete(target);
            applyRestore();
          };
          pendingRestoreOnNextMap.set(target, restoreOnUserNext);
          WebGAL.events.userInteractNext.on(restoreOnUserNext);
          console.log('[setAnimation][stop-restore-defer-next]', {
            animationName,
            target,
            key,
          });
        } else {
          applyRestore();
        }
        return;
      }
      WebGAL.gameplay.pixiStage?.removeAnimationWithSetEffects(key);
      console.log('[setAnimation][stop-keep-end-state]', {
        animationName,
        target,
        key,
        restoreTransform,
      });
    }, 0);
  };

  return {
    performName: performInitName,
    duration: animationDuration,
    isHoldOn: keep,
    stopFunction,
    blockingNext: () => false,
    blockingAuto: () => !keep,
    stopTimeout: undefined, // 暂时不用，后面会交给自动清除
  };
};

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
  return transform;
}

function getBaseTransformFromSettings(target: string): ITransform | undefined {
  return webgalStore.getState().stage.animationSettings.find((setting) => setting.target === target)?.baseTransform;
}

function getTargetEffectTransform(target: string): ITransform | undefined {
  return webgalStore.getState().stage.effects.find((effect) => effect.target === target)?.transform;
}
