import { generateUniversalSoftInAnimationObj } from '@/Core/controller/stage/pixi/animations/universalSoftIn';
import { logger } from '@/Core/util/logger';
import { generateUniversalSoftOffAnimationObj } from '@/Core/controller/stage/pixi/animations/universalSoftOff';
import { webgalStore } from '@/store/store';
import cloneDeep from 'lodash/cloneDeep';
import { baseTransform, ITransform } from '@/store/stageInterface';
import { generateTimelineObj } from '@/Core/controller/stage/pixi/animations/timeline';
import { WebGAL } from '@/Core/WebGAL';
import PixiStage, { IAnimationObject } from '@/Core/controller/stage/pixi/PixiController';
import {
  DEFAULT_BG_IN_DURATION,
  DEFAULT_BG_OUT_DURATION,
  DEFAULT_FIG_IN_DURATION,
  DEFAULT_FIG_OUT_DURATION,
} from '../constants';

// eslint-disable-next-line max-params
export function getAnimationObject(
  animationName: string,
  target: string,
  duration: number,
  writeDefault: boolean,
  keepOffset = false,
  baseTransformOverride?: ITransform,
) {
  const effect = WebGAL.animationManager.getAnimations().find((ani) => ani.name === animationName);
  if (effect) {
    const targetSetEffect = webgalStore.getState().stage.effects.find((e) => e.target === target);
    const baseForRelative = !writeDefault && keepOffset
      ? (baseTransformOverride ?? targetSetEffect?.transform ?? getCurrentTargetTransform(target) ?? baseTransform)
      : null;
    const baseForEffect = !writeDefault
      ? (keepOffset && baseForRelative ? baseForRelative : (targetSetEffect?.transform ?? baseTransform))
      : baseTransform;
    if (keepOffset && baseForRelative) {
      const sampleFrame = effect.effects.length > 0 ? applyRelativeFrame(effect.effects[0], baseForRelative) : null;
      console.log('[animation] apply keepOffset', {
        target,
        animationName,
        basePosition: baseForRelative.position,
        baseScale: baseForRelative.scale,
        sampleFrame,
      });
    }
    const mappedEffects = effect.effects.map((effect) => {
      let newEffect;

      newEffect = cloneDeep({ ...baseForEffect, duration: 0, ease: '' });

      const frame = baseForRelative ? applyRelativeFrame(effect, baseForRelative) : effect;
      PixiStage.assignTransform(newEffect, frame);
      newEffect.duration = effect.duration;
      newEffect.ease = effect.ease;
      return newEffect;
    });
    logger.debug('装载自定义动画', mappedEffects);
    return generateTimelineObj(mappedEffects, target, duration);
  }
  return null;
}

function applyRelativeFrame(frame: any, base: ITransform) {
  const next = cloneDeep(frame ?? {});
  if (next.position) {
    next.position = {
      ...next.position,
      x: (next.position.x ?? 0) + base.position.x,
      y: (next.position.y ?? 0) + base.position.y,
    };
  }
  if (next.scale) {
    next.scale = {
      ...next.scale,
      x: (next.scale.x ?? 1) * base.scale.x,
      y: (next.scale.y ?? 1) * base.scale.y,
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
  transform.position.x = container.x ?? transform.position.x;
  transform.position.y = container.y ?? transform.position.y;
  transform.scale.x = container.scale?.x ?? transform.scale.x;
  transform.scale.y = container.scale?.y ?? transform.scale.y;
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
    let duration = DEFAULT_FIG_IN_DURATION;
    if (isBg) {
      duration = DEFAULT_BG_IN_DURATION;
    }
    duration =
      webgalStore.getState().stage.animationSettings.find((setting) => setting.target === target)?.enterDuration ??
      duration;
    // 走默认动画
    let animation: IAnimationObject | null = generateUniversalSoftInAnimationObj(realTarget ?? target, duration);

    const keepOffset = webgalStore
      .getState()
      .stage.animationSettings.find((setting) => setting.target === target)?.enterKeepOffset ?? false;
    const animationName = webgalStore
      .getState()
      .stage.animationSettings.find((setting) => setting.target === target)?.enterAnimationName;
    const baseTransformFromSetting = keepOffset
      ? webgalStore.getState().stage.animationSettings.find((setting) => setting.target === target)?.baseTransform
      : undefined;
    if (animationName) {
      logger.debug('取代默认进入动画', target);
      animation = getAnimationObject(
        animationName,
        realTarget ?? target,
        getAnimateDuration(animationName),
        false,
        keepOffset,
        keepOffset ? baseTransformFromSetting : undefined,
      );
      duration = getAnimateDuration(animationName);
    }
    return { duration, animation };
  } else {
    // exit
    let duration = DEFAULT_FIG_OUT_DURATION;
    if (isBg) {
      duration = DEFAULT_BG_OUT_DURATION;
    }
    duration =
      webgalStore.getState().stage.animationSettings.find((setting) => setting.target + '-off' === target)
        ?.exitDuration ?? duration;
    // 走默认动画
    let animation: IAnimationObject | null = generateUniversalSoftOffAnimationObj(realTarget ?? target, duration);
    const keepOffset = webgalStore
      .getState()
      .stage.animationSettings.find((setting) => setting.target + '-off' === target)?.exitKeepOffset ?? false;
    const animationName = webgalStore
      .getState()
      .stage.animationSettings.find((setting) => setting.target + '-off' === target)?.exitAnimationName;
    const baseTransformFromSetting = keepOffset
      ? (() => {
        const setting = webgalStore.getState().stage.animationSettings.find((item) => item.target + '-off' === target);
        if (setting?.baseTransform) return setting.baseTransform;
        if (target.endsWith('-off')) {
          const originTarget = target.slice(0, -4);
          return webgalStore.getState().stage.animationSettings.find((item) => item.target === originTarget)
            ?.baseTransform;
        }
        return undefined;
      })()
      : undefined;
    if (animationName) {
      logger.debug('取代默认退出动画', target);
      animation = getAnimationObject(
        animationName,
        realTarget ?? target,
        getAnimateDuration(animationName),
        false,
        keepOffset,
        keepOffset ? baseTransformFromSetting : undefined,
      );
      duration = getAnimateDuration(animationName);
    }
    return { duration, animation };
  }
}
