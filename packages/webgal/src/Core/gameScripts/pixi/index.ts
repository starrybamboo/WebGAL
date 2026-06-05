import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { IPerform } from '@/Core/Modules/perform/performInterface';
import { logger } from '@/Core/util/logger';
import { IResult, call } from '../../util/pixiPerformManager/pixiPerformManager';

import { WebGAL } from '@/Core/WebGAL';
import { getBooleanArgByKey, getNumberArgByKey, getStringArgByKey } from '@/Core/util/getSentenceArg';
import * as PIXI from 'pixi.js';

const DEFAULT_EFFECT_DURATION = 2000;

const getTargetBounds = (targetKey: string) => {
  const target = WebGAL.gameplay.pixiStage?.getStageObjByKey(targetKey);
  const targetContainer = target?.pixiContainer;
  if (!targetContainer) return null;
  for (const child of targetContainer.children) {
    if (child instanceof PIXI.Sprite) {
      return child.getBounds();
    }
  }
  return targetContainer.getBounds();
};

const alignEffectContainer = (
  layerResult: IResult['fg'] | IResult['bg'],
  targetKey: string,
  options?: { offsetX?: number; offsetY?: number; screenX?: number; screenY?: number },
  retryCount = 0,
) => {
  if (!layerResult) return;
  const container = layerResult.container;
  if (!container || container.destroyed) return;
  const offsetX = options?.offsetX ?? 0;
  const offsetY = options?.offsetY ?? 0;
  const screenX = options?.screenX;
  const screenY = options?.screenY;
  const needsTarget = typeof screenX !== 'number' || typeof screenY !== 'number';
  let center: { x: number; y: number } | null = null;
  if (needsTarget) {
    const target = WebGAL.gameplay.pixiStage?.getStageObjByKey(targetKey);
    const targetContainer = target?.pixiContainer as PIXI.Container | null;
    if (!targetContainer) {
      if (retryCount < 6) {
        setTimeout(() => alignEffectContainer(layerResult, targetKey, options, retryCount + 1), 60);
      }
      return;
    }
    const bounds = getTargetBounds(targetKey);
    if (bounds && bounds.width > 1 && bounds.height > 1) {
      center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
    } else if (typeof targetContainer.getGlobalPosition === 'function') {
      const globalPos = targetContainer.getGlobalPosition();
      center = { x: globalPos.x, y: globalPos.y };
    }
    if (!center) {
      if (retryCount < 6) {
        setTimeout(() => alignEffectContainer(layerResult, targetKey, options, retryCount + 1), 60);
      }
      return;
    }
  }
  const desired = {
    x: (typeof screenX === 'number' ? screenX : center?.x ?? 0) + offsetX,
    y: (typeof screenY === 'number' ? screenY : center?.y ?? 0) + offsetY,
  };
  const parent = container.parent as PIXI.Container | null;
  const local = parent ? parent.toLocal(desired) : desired;
  container.position.set(local.x, local.y);
};

const findFirstSprite = (container: PIXI.Container): PIXI.Sprite | null => {
  for (const child of container.children) {
    if (child instanceof PIXI.Sprite) return child;
  }
  return null;
};

const applySpriteScaleToTarget = (
  layerResult: IResult['fg'] | IResult['bg'],
  targetKey: string,
  scaleFactor: number,
) => {
  if (!layerResult) return;
  const target = WebGAL.gameplay.pixiStage?.getStageObjByKey(targetKey);
  const targetContainer = target?.pixiContainer;
  const container = layerResult.container;
  if (!targetContainer || !container) return;
  const sprite = findFirstSprite(container);
  if (!sprite) return;

  const applyScale = (retryCount = 0) => {
    const texWidth = sprite.texture.width || sprite.texture.baseTexture.width || 1;
    const texHeight = sprite.texture.height || sprite.texture.baseTexture.height || 1;
    if (texWidth <= 1 || texHeight <= 1) {
      if (retryCount < 5) {
        setTimeout(() => applyScale(retryCount + 1), 100);
      }
      return;
    }
    // 按特效自身像素尺寸显示，仅应用外部 scale 参数
    sprite.scale.set(scaleFactor);
  };

  if (sprite.texture.baseTexture.valid) {
    applyScale();
  } else {
    sprite.texture.baseTexture.once('loaded', applyScale);
  }
};

const applySpriteScale = (layerResult: IResult['fg'] | IResult['bg'], scaleFactor: number) => {
  if (!layerResult) return;
  const sprite = findFirstSprite(layerResult.container);
  if (!sprite) return;
  const apply = () => {
    sprite.scale.set(scaleFactor);
  };
  if (sprite.texture.baseTexture.valid) {
    apply();
  } else {
    sprite.texture.baseTexture.once('loaded', apply);
  }
};

const setSequenceLoop = (layerResult: IResult['fg'] | IResult['bg'], loop: boolean) => {
  if (!layerResult) return;
  const sprite = findFirstSprite(layerResult.container);
  if (!sprite) return;
  const resource = sprite.texture.baseTexture.resource as { loop?: boolean; play?: () => void } | undefined;
  if (resource && typeof resource.loop === 'boolean') {
    resource.loop = loop;
    if (!loop && typeof resource.play === 'function') {
      resource.play();
    }
  }
};

/**
 * 运行一段pixi演出
 * @param sentence
 */
export const pixi = (sentence: ISentence): IPerform => {
  const pixiPerformName = 'PixiPerform' + sentence.content;
  let fg: IResult['fg'];
  let bg: IResult['bg'];
  let targetKey = getStringArgByKey(sentence, 'target');
  const offsetX = getNumberArgByKey(sentence, 'offsetX') ?? 0;
  const offsetY = getNumberArgByKey(sentence, 'offsetY') ?? 0;
  const screenX = getNumberArgByKey(sentence, 'screenX');
  const screenY = getNumberArgByKey(sentence, 'screenY');
  const scaleFactor = getNumberArgByKey(sentence, 'scale') ?? 1;
  const once = getBooleanArgByKey(sentence, 'once') ?? false;
  const durationArg = getNumberArgByKey(sentence, 'duration');
  if (!targetKey && sentence.content.startsWith('effect.')) {
    const figures = WebGAL.gameplay.pixiStage?.figureObjects ?? [];
    for (let i = figures.length - 1; i >= 0; i -= 1) {
      const fig = figures[i];
      if (fig?.pixiContainer && !fig.isExiting) {
        targetKey = fig.key;
        break;
      }
    }
  }
  WebGAL.gameplay.performController.performList.forEach((e) => {
    if (e.performName === pixiPerformName) {
      return {
        performName: 'none',
        duration: 0,
        isOver: false,
        isHoldOn: true,
        stopFunction: () => {},
        blockingNext: () => false,
        blockingAuto: () => false,
        stopTimeout: undefined, // 暂时不用，后面会交给自动清除
      };
    }
  });

  return {
    performName: pixiPerformName,
    duration: once ? Math.max(durationArg ?? DEFAULT_EFFECT_DURATION, 1) : 0,
    isHoldOn: !once,
    startFunction: () => {
      const res: IResult = call(sentence.content);
      fg = res.fg;
      bg = res.bg;

      if (targetKey) {
        alignEffectContainer(fg, targetKey, {
          offsetX,
          offsetY,
          screenX: typeof screenX === 'number' ? screenX : undefined,
          screenY: typeof screenY === 'number' ? screenY : undefined,
        });
        alignEffectContainer(bg, targetKey, {
          offsetX,
          offsetY,
          screenX: typeof screenX === 'number' ? screenX : undefined,
          screenY: typeof screenY === 'number' ? screenY : undefined,
        });
        applySpriteScaleToTarget(fg, targetKey, scaleFactor);
        applySpriteScaleToTarget(bg, targetKey, scaleFactor);
      } else if (offsetX !== 0 || offsetY !== 0) {
        if (fg?.container) {
          fg.container.position.set(fg.container.position.x + offsetX, fg.container.position.y + offsetY);
        }
        if (bg?.container) {
          bg.container.position.set(bg.container.position.x + offsetX, bg.container.position.y + offsetY);
        }
        applySpriteScale(fg, scaleFactor);
        applySpriteScale(bg, scaleFactor);
      } else {
        applySpriteScale(fg, scaleFactor);
        applySpriteScale(bg, scaleFactor);
      }

      if (once) {
        setSequenceLoop(fg, false);
        setSequenceLoop(bg, false);
      }
    },
    // 一次性特效不应吞掉“下一句”点击；点击应直接作用于当前对话推进。
    skipNextCollect: once,
    // 推进句子时，立即结束一次性特效，避免和下一句特效叠加。
    stopWhenSentenceAdvanced: once,
    stopFunction: () => {
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
    blockingNext: () => false,
    blockingAuto: () => false,
  };
};
