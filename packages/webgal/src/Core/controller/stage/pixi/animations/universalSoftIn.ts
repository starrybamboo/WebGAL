import { WebGAL } from '@/Core/WebGAL';

export function generateUniversalSoftInAnimationObj(targetKey: string, _duration: number) {
  const target = WebGAL.gameplay.pixiStage!.getStageObjByKey(targetKey);

  /**
   * 在此书写为动画设置初态的操作
   */
  function setStartState() {
    if (target?.pixiContainer) {
      // 软切只保留一个很短的等待，进入阶段先保持隐藏，结束时一次性显现
      target.pixiContainer.alphaFilterVal = 0;
    }
  }

  /**
   * 在此书写为动画设置终态的操作
   */
  function setEndState() {
    if (target?.pixiContainer) {
      // 终态是完全不透明，这保持不变
      target.pixiContainer.alphaFilterVal = 1;
    }
  }

  /**
   * 在此书写动画每一帧执行的函数
   * @param delta
   */
  function tickerFunc(_delta: number) {}

  function getEndStateEffect() {
    return { alpha: 1 };
  }

  return {
    setStartState,
    setEndState,
    tickerFunc,
    getEndStateEffect,
  };
}
