import type { IStageAnimationSetting } from '@/Core/Modules/stage/stageInterface';
import { getAnimateDuration, getAnimationObject } from '@/Core/Modules/animationFunctions';
import { generateTimelineObj } from '@/Core/controller/stage/pixi/animations/timeline';
import type { IAnimationObject } from '@/Core/controller/stage/pixi/PixiController';
import { WebGAL } from '@/Core/WebGAL';
import { buildCharacterTransformTimeline, CharacterPresentationController } from './characterPresentation';

const controller = new CharacterPresentationController({
  isSkipAnimation: () => WebGAL.gameplay.skipAnimation,
  buildNamedAnimation: (target, setting) => buildNamedAnimation(target, setting),
  buildTransformAnimation: (target, setting) => {
    const timeline = buildCharacterTransformTimeline(setting);
    if (timeline.length === 0 || !WebGAL.gameplay.pixiStage) return null;
    const duration = setting.enterDuration ?? 500;
    return {
      animation: generateTimelineObj(timeline, target, duration),
      duration,
    };
  },
  registerAnimation: (animation, animationKey, target) => {
    WebGAL.gameplay.pixiStage?.registerAnimation(animation as IAnimationObject, animationKey, target);
  },
  removeAnimation: (animationKey) => WebGAL.gameplay.pixiStage?.removeAnimation(animationKey),
});

export function playCharacterPresentation(target: string, setting: IStageAnimationSetting | undefined): void {
  controller.play(target, setting);
}

export function clearCharacterPresentation(target: string): void {
  controller.clear(target);
}

function buildNamedAnimation(target: string, setting: IStageAnimationSetting) {
  if (!setting.enterAnimationName) return null;
  const duration = getAnimateDuration(setting.enterAnimationName);
  const animation = getAnimationObject(
    setting.enterAnimationName,
    target,
    duration,
    false,
    !(setting.enterAnimationIgnoreDefault ?? false),
  );
  return animation ? { animation, duration } : null;
}
