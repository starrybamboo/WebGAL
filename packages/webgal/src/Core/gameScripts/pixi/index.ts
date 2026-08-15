import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { IPerform } from '@/Core/Modules/perform/performInterface';
import { logger } from '@/Core/util/logger';
import { IResult, call, hasPerform } from '../../util/pixiPerformManager/pixiPerformManager';
import { ensureRuntimePerformLoaded } from '@/Core/util/pixiPerformManager/runtimePixiPerformLoader';

import { WebGAL } from '@/Core/WebGAL';

/**
 * 运行一段pixi演出
 * @param sentence
 */
export const pixi = (sentence: ISentence): IPerform => {
  const pixiPerformName = 'PixiPerform' + sentence.content;
  let fg: IResult['fg'];
  let bg: IResult['bg'];
  let loading = false;
  let stopped = false;

  const mountPerform = () => {
    const res: IResult = call(sentence.content);
    fg = res.fg;
    bg = res.bg;
  };

  const perform: IPerform = {
    performName: pixiPerformName,
    duration: 0,
    isHoldOn: true,
    startFunction: () => {
      if (hasPerform(sentence.content)) {
        mountPerform();
        return;
      }

      loading = true;
      void ensureRuntimePerformLoaded(sentence.content)
        .then(() => {
          if (stopped) return;
          mountPerform();
          loading = false;
        })
        .catch((error) => {
          loading = false;
          if (stopped) return;
          logger.error(`运行时 Pixi 特效 "${sentence.content}" 加载或启动失败`, error);
          WebGAL.gameplay.performController.softUnmountPerformObject(perform);
        });
    },
    stopFunction: () => {
      stopped = true;
      loading = false;
      logger.warn('现在正在卸载pixi演出');
      if (fg) {
        fg.container.destroy({ texture: true, baseTexture: true });
        WebGAL.gameplay.pixiStage?.foregroundEffectsContainer.removeChild(fg.container);
        WebGAL.gameplay.pixiStage?.removeAnimation(fg.tickerKey);
      }
      if (bg) {
        bg.container.destroy({ texture: true, baseTexture: true });
        WebGAL.gameplay.pixiStage?.backgroundEffectsContainer.removeChild(bg.container);
        WebGAL.gameplay.pixiStage?.removeAnimation(bg.tickerKey);
      }
    },
    blockingNext: () => loading,
    blockingAuto: () => loading,
  };

  return perform;
};
