import { ITransform } from '@/Core/Modules/stage/stageInterface';

export interface IUserAnimation {
  name: string;
  effects: Array<AnimationFrame>;
  /** 用户动画使用相对帧；无标记的引擎动态时间线保持绝对语义。 */
  frameMode?: 'relative';
}

export type AnimationFrame = ITransform & { duration: number; ease: string };

export class AnimationManager {
  // public nextEnterAnimationName: Map<string, string> = new Map();
  // public nextExitAnimationName: Map<string, string> = new Map();
  private animations: Array<IUserAnimation> = [];

  public addAnimation(animation: IUserAnimation) {
    this.animations.push(animation);
  }
  public getAnimations() {
    return this.animations;
  }
}
