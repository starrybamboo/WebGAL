import { generateUniversalSoftInAnimationObj } from '@/Core/controller/stage/pixi/animations/universalSoftIn';
import { logger } from '@/Core/util/logger';
import { generateUniversalSoftOffAnimationObj } from '@/Core/controller/stage/pixi/animations/universalSoftOff';
import cloneDeep from 'lodash/cloneDeep';
import { baseTransform, ITransform } from '@/Core/Modules/stage/stageInterface';
import { generateTimelineObj } from '@/Core/controller/stage/pixi/animations/timeline';
import { WebGAL } from '@/Core/WebGAL';
import PixiStage, { IAnimationObject } from '@/Core/controller/stage/pixi/PixiController';
import { IUserAnimation } from './animations';
import { pickBy } from 'lodash';
import {
  DEFAULT_BG_IN_DURATION,
  DEFAULT_BG_OUT_DURATION,
} from '../constants';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { AnimationFrame } from '@/Core/Modules/animations';
import {
  getConfiguredFigureDefaultTransitionAnimation,
  getConfiguredFigureDefaultTransitionDuration,
} from '@/Core/util/figureTransitionConfig';
import { webgalStore } from '@/store/store';

// eslint-disable-next-line max-params
export function getAnimationObject(
  animationName: string,
  target: string,
  duration: number,
  writeDefault: boolean,
  writeFullEffect = true,
  syncEndStateToStageState = true,
  keepOffset = false,
  baseTransformOverride?: ITransform,
) {
  const mappedEffects = getAnimationTimeline(
    animationName,
    target,
    writeDefault,
    writeFullEffect,
    keepOffset,
    baseTransformOverride,
  );
  if (mappedEffects) {
    return generateTimelineObj(mappedEffects, target, duration, syncEndStateToStageState);
  }
  return null;
}

export function applyAnimationEndState(
  animationName: string,
  target: string,
  writeDefault: boolean,
  writeFullEffect = true,
) {
  const mappedEffects = getAnimationTimeline(animationName, target, writeDefault, writeFullEffect);
  if (!mappedEffects || mappedEffects.length === 0) return null;
  const { duration, ease, ...endState } = mappedEffects[mappedEffects.length - 1];
  stageStateManager.updateEffect({ target, transform: endState });
  return mappedEffects;
}

export function getAnimationTimeline(
  animationName: string,
  target: string,
  writeDefault: boolean,
  writeFullEffect = true,
  keepOffset = false,
  baseTransformOverride?: ITransform,
): AnimationFrame[] | null {
  const effect = WebGAL.animationManager.getAnimations().find((ani) => ani.name === animationName);
  if (effect) {
    const unionKeys = new Set<string>();
    const unionScaleKeys = new Set<string>();
    const unionPositionKeys = new Set<string>();
    if (!writeFullEffect) {
      effect.effects.forEach((effect) => {
        Object.keys(effect).forEach((k) => unionKeys.add(k));
        if (effect.scale) Object.keys(effect.scale).forEach((k) => unionScaleKeys.add(k));
        if (effect.position) Object.keys(effect.position).forEach((k) => unionPositionKeys.add(k));
      });
    }
    const mappedEffects = effect.effects.map((effect) => {
      const targetSetEffect = stageStateManager.getCalculationStageState().effects.find((e) => e.target === target);
      const baseForRelative =
        !writeDefault && keepOffset
          ? baseTransformOverride ?? targetSetEffect?.transform ?? getCurrentTargetTransform(target) ?? baseTransform
          : null;
      const baseForEffect =
        !writeDefault && keepOffset && baseForRelative ? baseForRelative : targetSetEffect?.transform;
      let newEffect;

      if (!writeDefault && baseForEffect) {
        if (writeFullEffect || keepOffset) {
          newEffect = cloneDeep({ ...baseForEffect, duration: 0, ease: '' });
        } else {
          const targetScale = pickBy(baseForEffect.scale || {}, (source, key) => unionScaleKeys.has(key));
          const targetPosition = pickBy(baseForEffect.position || {}, (source, key) => unionPositionKeys.has(key));
          const originalTransform = { ...pickBy(baseForEffect, (source, key) => unionKeys.has(key)) };
          originalTransform.scale = targetScale;
          originalTransform.position = targetPosition;
          newEffect = cloneDeep({ ...originalTransform, duration: 0, ease: '' });
        }
      } else {
        newEffect = cloneDeep({ ...baseTransform, duration: 0, ease: '' });
      }

      const frame = baseForRelative ? applyRelativeFrame(effect, baseForRelative) : effect;
      PixiStage.assignTransform(newEffect, frame, false);
      newEffect.duration = effect.duration;
      newEffect.ease = effect.ease;
      return newEffect;
    });
    logger.debug('装载自定义动画', mappedEffects);
    return mappedEffects;
  }
  return null;
}

function applyRelativeFrame(frame: any, base: ITransform) {
  const next = cloneDeep(frame ?? {});
  if (next.position) {
    next.position = {
      ...next.position,
      x: (next.position.x ?? 0) + (base.position?.x ?? 0),
      y: (next.position.y ?? 0) + (base.position?.y ?? 0),
    };
  }
  if (next.scale) {
    next.scale = {
      ...next.scale,
      x: (next.scale.x ?? 1) * (base.scale?.x ?? 1),
      y: (next.scale.y ?? 1) * (base.scale?.y ?? 1),
    };
  }
  return next;
}

function getCurrentTargetTransform(target: string): ITransform | null {
  const stageObj = WebGAL.gameplay.pixiStage?.getStageObjByKey(target);
  const container = stageObj?.pixiContainer;
  if (!container) {
    return null;
  }
  const transform = cloneDeep(baseTransform);
  transform.alpha = container.alpha ?? transform.alpha;
  transform.position = transform.position ?? { x: 0, y: 0 };
  transform.scale = transform.scale ?? { x: 1, y: 1 };
  transform.position.x = container.x ?? transform.position.x ?? 0;
  transform.position.y = container.y ?? transform.position.y ?? 0;
  transform.scale.x = container.scale?.x ?? transform.scale.x ?? 1;
  transform.scale.y = container.scale?.y ?? transform.scale.y ?? 1;
  transform.rotation = container.rotation ?? transform.rotation;
  return transform;
}

export function getAnimateDuration(animationName: string) {
  const effect = WebGAL.animationManager.getAnimations().find((ani) => ani.name === animationName);
  if (effect) {
    let duration = 0;
    effect.effects.forEach((e) => {
      duration += e.duration;
    });
    return duration;
  }
  return 0;
}

// eslint-disable-next-line max-params
function getConfiguredDefaultAnimationObject(
  animationName: string | null,
  target: string,
  baseTransformOverride?: ITransform,
) {
  if (!animationName) {
    return null;
  }
  const animation = getAnimationObject(
    animationName,
    target,
    getAnimateDuration(animationName),
    false,
    true,
    true,
    true,
    baseTransformOverride,
  );
  if (!animation) {
    logger.warn('未找到配置的默认立绘动画，回退内置动画', animationName);
    return null;
  }
  return {
    duration: getAnimateDuration(animationName),
    animation,
  };
}

// eslint-disable-next-line max-params
export function getEnterExitAnimation(
  target: string,
  type: 'enter' | 'exit',
  isBg = false,
  realTarget?: string, // 用于立绘和背景移除时，以当前时间打上特殊标记
): {
  duration: number;
  animation: IAnimationObject | null;
} {
  if (type === 'enter') {
    const globalGameVar = webgalStore.getState().userData.globalGameVar;
    let duration = getConfiguredFigureDefaultTransitionDuration(globalGameVar, 'enter');
    const defaultAnimationName = getConfiguredFigureDefaultTransitionAnimation(globalGameVar, 'enter');
    if (isBg) {
      duration = DEFAULT_BG_IN_DURATION;
    }
    duration =
      stageStateManager.getCalculationStageState().animationSettings.find((setting) => setting.target === target)
        ?.enterDuration ??
      duration;
    // 走默认动画
    let animation: IAnimationObject | null = generateUniversalSoftInAnimationObj(realTarget ?? target, duration);

    const animationSetting = stageStateManager
      .getCalculationStageState()
      .animationSettings.find((setting) => setting.target === target);
    const keepOffset = animationSetting?.enterKeepOffset ?? false;
    const animationName = animationSetting?.enterAnimationName;
    const baseTransformFromSetting = animationSetting?.baseTransform;
    if (animationName) {
      logger.debug('取代默认进入动画', target);
      animation = getAnimationObject(
        animationName,
        realTarget ?? target,
        getAnimateDuration(animationName),
        false,
        true,
        true,
        keepOffset,
        keepOffset ? baseTransformFromSetting : undefined,
      );
      duration = getAnimateDuration(animationName);
    } else if (!isBg) {
      const defaultAnimation = getConfiguredDefaultAnimationObject(
        defaultAnimationName,
        realTarget ?? target,
        baseTransformFromSetting,
      );
      if (defaultAnimation) {
        animation = defaultAnimation.animation;
        duration = defaultAnimation.duration;
      }
    }
    return { duration, animation };
  } else {
    // exit
    const globalGameVar = webgalStore.getState().userData.globalGameVar;
    let duration = getConfiguredFigureDefaultTransitionDuration(globalGameVar, 'exit');
    const defaultAnimationName = getConfiguredFigureDefaultTransitionAnimation(globalGameVar, 'exit');
    if (isBg) {
      duration = DEFAULT_BG_OUT_DURATION;
    }
    const animationSettings = stageStateManager
      .getCalculationStageState()
      .animationSettings.find((setting) => setting.target === target || `${setting.target}-off` === target);
    duration = animationSettings?.exitDuration ?? duration;
    // 走默认动画
    let animation: IAnimationObject | null = generateUniversalSoftOffAnimationObj(realTarget ?? target, duration);
    const animationName = animationSettings?.exitAnimationName;
    const keepOffset = animationSettings?.exitKeepOffset ?? false;
    const baseTransformFromSetting = getExitBaseTransformFromSetting(target, animationSettings);
    if (animationName) {
      logger.debug('取代默认退出动画', target);
      animation = getAnimationObject(
        animationName,
        realTarget ?? target,
        getAnimateDuration(animationName),
        false,
        true,
        true,
        keepOffset,
        keepOffset ? baseTransformFromSetting : undefined,
      );
      duration = getAnimateDuration(animationName);
    } else if (!isBg) {
      const defaultAnimation = getConfiguredDefaultAnimationObject(
        defaultAnimationName,
        realTarget ?? target,
        baseTransformFromSetting,
      );
      if (defaultAnimation) {
        animation = defaultAnimation.animation;
        duration = defaultAnimation.duration;
      }
    }
    if (animationSettings) {
      // 退出动画拿完后，删了这个设定
      stageStateManager.removeAnimationSettingsByTargetOff(animationSettings.target);
      logger.debug('删除退出动画设定', target);
    }
    return { duration, animation };
  }
}

function getExitBaseTransformFromSetting(
  target: string,
  animationSettings: { baseTransform?: ITransform } | undefined,
) {
  if (animationSettings?.baseTransform) return animationSettings.baseTransform;
  if (target.endsWith('-off')) {
    const originTarget = target.slice(0, -4);
    return stageStateManager
      .getCalculationStageState()
      .animationSettings.find((item) => item.target === originTarget)?.baseTransform;
  }
  return undefined;
}
