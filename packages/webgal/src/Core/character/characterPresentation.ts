import type { IStageAnimationSetting, ITransform } from '@/Core/Modules/stage/stageInterface';

interface ICharacterPresentationAnimation {
  animation: unknown;
  duration: number;
}

export interface ICharacterPresentationRuntime {
  isSkipAnimation: () => boolean;
  buildNamedAnimation: (target: string, setting: IStageAnimationSetting) => ICharacterPresentationAnimation | null;
  buildTransformAnimation: (target: string, setting: IStageAnimationSetting) => ICharacterPresentationAnimation | null;
  registerAnimation: (animation: unknown, animationKey: string, target: string) => void;
  removeAnimation: (animationKey: string) => void;
}

export class CharacterPresentationController {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  public constructor(private readonly runtime: ICharacterPresentationRuntime) {}

  public play(target: string, setting: IStageAnimationSetting | undefined): void {
    this.clear(target);
    if (!setting || this.runtime.isSkipAnimation()) return;
    const prepared = setting.enterAnimationName
      ? this.runtime.buildNamedAnimation(target, setting)
      : this.runtime.buildTransformAnimation(target, setting);
    if (!prepared) return;

    const animationKey = getCharacterPresentationKey(target);
    this.runtime.registerAnimation(prepared.animation, animationKey, target);
    if (prepared.duration <= 0) {
      this.runtime.removeAnimation(animationKey);
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(target);
      this.runtime.removeAnimation(animationKey);
    }, prepared.duration);
    this.timers.set(target, timer);
  }

  public clear(target: string): void {
    const timer = this.timers.get(target);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(target);
    }
    this.runtime.removeAnimation(getCharacterPresentationKey(target));
  }
}

export interface ICharacterTransformFrame extends ITransform {
  duration: number;
  ease: string;
}

export function buildCharacterTransformTimeline(setting: IStageAnimationSetting): ICharacterTransformFrame[] {
  if (!setting.enterTransform) return [];
  const duration = setting.enterDuration ?? 500;
  const ease = setting.enterEase ?? '';
  const endTransform = cloneTransform(setting.enterTransform);
  const startTransform = cloneTransform(setting.baseTransform ?? { ...endTransform, alpha: 0 });
  return [
    { ...startTransform, duration: 0, ease },
    { ...endTransform, duration, ease },
  ];
}

function getCharacterPresentationKey(target: string): string {
  return `${target}-character-enter`;
}

function cloneTransform(transform: ITransform): ITransform {
  return {
    ...transform,
    position: transform.position ? { ...transform.position } : undefined,
    scale: transform.scale ? { ...transform.scale } : undefined,
  };
}
