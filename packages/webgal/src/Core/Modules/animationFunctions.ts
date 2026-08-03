import { logger } from '@/Core/util/logger';
import { generateUniversalSoftOffAnimationObj } from '@/Core/controller/stage/pixi/animations/universalSoftOff';
import cloneDeep from 'lodash/cloneDeep';
import { baseTransform, ITransform } from '@/Core/Modules/stage/stageInterface';
import { generateTimelineObj } from '@/Core/controller/stage/pixi/animations/timeline';
import { WebGAL } from '@/Core/WebGAL';
import PixiStage, { IAnimationObject } from '@/Core/controller/stage/pixi/PixiController';
import { pickBy } from 'lodash';
import { DEFAULT_BG_OUT_DURATION } from '../constants';
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
    return generateTimelineObj(mappedEffects, target, duration);
  }
  return null;
}

export function applyAnimationEndState(
  animationName: string,
  target: string,
  writeDefault: boolean,
  writeFullEffect = true,
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

/**
 * 取退出动画。
 *
 * 入场动画不在这里产出：它由 changeFigure/changeBg 作为普通演出返回，
 * 终态在演算期写入 effects，因此不需要视图层反推该播哪个动画。
 */
export function getExitAnimation(
  target: string,
  isBg = false,
  realTarget?: string, // 用于立绘和背景移除时，以当前时间打上特殊标记
): {
  duration: number;
  animation: IAnimationObject | null;
} {
  const globalGameVar = webgalStore.getState().userData.globalGameVar;
  let duration = isBg
    ? DEFAULT_BG_OUT_DURATION
    : getConfiguredFigureDefaultTransitionDuration(globalGameVar, 'exit');
  const configuredAnimationName = isBg
    ? null
    : getConfiguredFigureDefaultTransitionAnimation(globalGameVar, 'exit');
  const animationSettings = stageStateManager
    .getCalculationStageState()
    .animationSettings.find((setting) => setting.target === target);
  duration = animationSettings?.exitDuration ?? duration;
  // 走默认动画
  let animation: IAnimationObject | null = generateUniversalSoftOffAnimationObj(realTarget ?? target, duration);
  const animationName = animationSettings?.exitAnimationName ?? configuredAnimationName;
  if (animationName) {
    logger.debug('取代默认退出动画', target);
    const keepOffset = animationSettings?.exitKeepOffset ?? configuredAnimationName === animationName;
    const baseTransformFromSetting = getExitBaseTransformFromSetting(target, animationSettings);
    const configuredAnimation = getAnimationObject(
      animationName,
      realTarget ?? target,
      getAnimateDuration(animationName),
      false,
      !(animationSettings?.exitAnimationIgnoreDefault ?? false),
      keepOffset,
      keepOffset ? baseTransformFromSetting : undefined,
    );
    if (configuredAnimation) {
      animation = configuredAnimation;
      duration = getAnimateDuration(animationName);
    } else {
      logger.warn('未找到配置的默认立绘动画，回退内置动画', animationName);
    }
  }
  if (animationSettings) {
    // 退出动画拿完后，删了这个设定
    stageStateManager.removeAnimationSettingsByTargetOff(target);
    logger.debug('删除退出动画设定', target);
  }
  return { duration, animation };
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
