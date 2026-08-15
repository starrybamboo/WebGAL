import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { logger } from '@/Core/util/logger';
import { getFigurePositionFromArgs, getNumberArgByKey, getStringArgByKey } from '@/Core/util/getSentenceArg';
import { WebGAL } from '@/Core/WebGAL';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import type { ReleaseFigureFace } from '@/Core/figure/figureFaceRuntime';

const VOCAL_ELEMENT_RETRY_MS = 16;
const VOCAL_ELEMENT_MAX_ATTEMPTS = 60;

/**
 * 播放一段语音
 * @param sentence 语句
 */
export const playVocal = (sentence: ISentence, enableFigureFace = false) => {
  logger.debug('play vocal');
  const performInitName = 'vocal-play';

  const url = getStringArgByKey(sentence, 'vocal') ?? ''; // 获取语音的url
  let volume = getNumberArgByKey(sentence, 'volume') ?? 100; // 获取语音的音量比
  volume = Math.max(0, Math.min(volume, 100)); // 限制音量在 0-100 之间

  const pos = getFigurePositionFromArgs(sentence) || 'center';
  const key = getStringArgByKey(sentence, 'figureId') || `fig-${pos}`;

  // 先停止之前的语音
  WebGAL.gameplay.performController.unmountPerform('vocal-play', true);

  // 获得舞台状态
  stageStateManager.setStage('playVocal', url);
  stageStateManager.setStage('vocal', url);
  stageStateManager.setStage('vocalVolume', volume);

  let isOver = false;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let releaseFace: ReleaseFigureFace | undefined;
  let startToken = 0;
  let startAttempts = 0;

  const finishPerform = (token: number, error?: unknown) => {
    if (token !== startToken || isOver) return;
    if (error) {
      logger.warn('Vocal playback could not start or finish normally.', error);
    }
    isOver = true;
    WebGAL.gameplay.performController.unmountPerform(performInitName);
  };

  const scheduleStart = (token: number, delayMs: number) => {
    startTimer = setTimeout(() => tryStart(token), delayMs);
  };

  const tryStart = (token: number) => {
    if (token !== startToken || isOver) return;
    const vocalControl = document.getElementById('currentVocal') as HTMLMediaElement | null;
    const declaredSource = vocalControl?.getAttribute?.('src');
    if (!vocalControl || (typeof declaredSource === 'string' && declaredSource !== url)) {
      startAttempts += 1;
      if (startAttempts >= VOCAL_ELEMENT_MAX_ATTEMPTS) {
        finishPerform(token, new Error(`等待语音元素就绪超时：${url}`));
      } else {
        scheduleStart(token, VOCAL_ELEMENT_RETRY_MS);
      }
      return;
    }

    startTimer = undefined;
    vocalControl.currentTime = 0;
    if (enableFigureFace) {
      try {
        releaseFace = WebGAL.gameplay.figureFaceRuntime.speak(key, {
          kind: 'audio',
          media: vocalControl,
        });
      } catch (error) {
        logger.warn('Figure face runtime failed to observe this vocal; continuing audio playback.', error);
      }
    }

    try {
      vocalControl.play().catch((error) => finishPerform(token, error));
      vocalControl.onended = () => finishPerform(token);
    } catch (error) {
      finishPerform(token, error);
    }
  };

  /**
   * 嘴型同步
   */

  return {
    performName: performInitName,
    duration: 1000 * 60 * 60,
    isHoldOn: false,
    skipNextCollect: true,
    startFunction: () => {
      const token = ++startToken;
      startAttempts = 0;
      isOver = false;
      scheduleStart(token, 1);
    },
    stopFunction: () => {
      startToken += 1;
      isOver = true;
      if (startTimer) clearTimeout(startTimer);
      startTimer = undefined;
      releaseFace?.();
      releaseFace = undefined;
      const VocalControl = document.getElementById('currentVocal') as HTMLMediaElement | null;
      if (VocalControl) {
        VocalControl.pause();
        VocalControl.onended = null;
      }
    },
    blockingNext: () => false,
    blockingAuto: () => {
      return !isOver;
    },
  };
};
