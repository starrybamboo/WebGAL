import { webgalStore } from '@/store/store';
import { setVisibility } from '@/store/GUIReducer';
import { WebGAL } from '@/Core/WebGAL';
import { resetStage } from '@/Core/controller/stage/resetStage';
import { sceneFetcher } from '@/Core/controller/scene/sceneFetcher';
import { commitForward, forward } from '@/Core/controller/gamePlay/nextSentence';
import { sceneParser } from '@/Core/parser/sceneParser';
import { logger } from '@/Core/util/logger';
import { assetSetter, fileType } from '@/Core/util/gameAssetsAccess/assetSetter';
import type { IFastPreviewTimeoutPayload } from '@/types/debugProtocol';

const FAST_PREVIEW_SLOW_WARN_DURATION_MS = 500;
const FAST_PREVIEW_YIELD_INTERVAL = 100;

type FastPreviewTimeoutHandler = (payload: IFastPreviewTimeoutPayload) => void;

export const syncWithOrigine = (
  sceneName: string,
  sentenceId: number,
  onFastPreviewTimeout?: FastPreviewTimeoutHandler,
  forceReload = false,
) => {
  logger.warn('正在跳转到' + sceneName + ':' + sentenceId);
  WebGAL.gameplay.isFastPreview = false;
  const dispatch = webgalStore.dispatch;
  dispatch(setVisibility({ component: 'showTitle', visibility: false }));
  dispatch(setVisibility({ component: 'showMenuPanel', visibility: false }));
  dispatch(setVisibility({ component: 'isEnterGame', visibility: true }));
  dispatch(setVisibility({ component: 'isShowLogo', visibility: false }));
  const title = document.querySelector('.html-body__title-enter') as HTMLElement;
  if (title) {
    title.style.display = 'none';
  }
  // 重新获取场景
  const sceneUrl: string = assetSetter(sceneName, fileType.scene);
  const sceneFetchUrl = forceReload
    ? `${sceneUrl}${sceneUrl.includes('?') ? '&' : '?'}_webgalSync=${Date.now()}`
    : sceneUrl;
  // 场景写入到运行时
  sceneFetcher(sceneFetchUrl)
    .then((rawScene) => {
      resetStage(true);
      WebGAL.sceneManager.sceneData.currentScene = sceneParser(rawScene, sceneName, sceneUrl);
      // 开始快进到指定语句
      const currentSceneName = WebGAL.sceneManager.sceneData.currentScene.sceneName;
      void syncFast(sentenceId, currentSceneName, onFastPreviewTimeout);
    })
    .catch((e) => {
      WebGAL.gameplay.isFast = false;
      WebGAL.gameplay.isFastPreview = false;
      logger.error('实时预览跳转错误', e);
    });
};

export async function syncFast(
  sentenceId: number,
  currentSceneName: string,
  onFastPreviewTimeout?: FastPreviewTimeoutHandler,
) {
  const fastPreviewStartTime = performance.now();
  const baseSceneStackDepth = WebGAL.sceneManager.sceneData.sceneStack.length;
  WebGAL.gameplay.isFast = true;
  WebGAL.gameplay.isFastPreview = true;
  let forwardCount = 0;
  let slowPreviewWarned = false;
  let suspendedElapsedMs = 0;

  try {
    while (shouldContinueFastPreview(sentenceId, currentSceneName, baseSceneStackDepth)) {
      const prevSentenceId = WebGAL.sceneManager.sceneData.currentSentenceId;
      const prevSceneName = WebGAL.sceneManager.sceneData.currentScene.sceneName;
      const isForwarded = forward();
      forwardCount++;
      const sceneWriteWaitStart = performance.now();
      const awaitedSceneWrite = await waitForPendingSceneWrite();
      if (awaitedSceneWrite) {
        suspendedElapsedMs += performance.now() - sceneWriteWaitStart;
      }

      if (!isForwarded && !awaitedSceneWrite) {
        break;
      }

      if (forwardCount % FAST_PREVIEW_YIELD_INTERVAL === 0) {
        const elapsedMs = performance.now() - fastPreviewStartTime - suspendedElapsedMs;
        if (!slowPreviewWarned && elapsedMs > FAST_PREVIEW_SLOW_WARN_DURATION_MS) {
          slowPreviewWarned = true;
          logger.warn(`实时预览快进耗时超过 ${FAST_PREVIEW_SLOW_WARN_DURATION_MS}ms，继续快进到目标语句`);
        }
        await yieldFastPreviewControl();
      }

      if (WebGAL.gameplay.performController.hasPendingBlockingStateCalculationPerform()) {
        const stateCalculationWaitStart = performance.now();
        const resolved = await WebGAL.gameplay.performController.resolvePendingBlockingStateCalculationPerforms();
        if (resolved) {
          suspendedElapsedMs += performance.now() - stateCalculationWaitStart;
        } else {
          logger.warn('实时预览在需要外部输入的语句前停止演算');
          break;
        }
      }

      if (
        WebGAL.sceneManager.sceneData.currentSentenceId === prevSentenceId &&
        WebGAL.sceneManager.sceneData.currentScene.sceneName === prevSceneName &&
        !awaitedSceneWrite
      ) {
        logger.warn('实时预览跳转停止：本次 forward 没有推进语句指针');
        break;
      }

    }
  } finally {
    WebGAL.gameplay.isFast = false;
    WebGAL.gameplay.isFastPreview = false;
  }

  commitForward();
  const forwardedLineCount =
    WebGAL.sceneManager.sceneData.currentScene.sceneName === currentSceneName
      ? Math.min(WebGAL.sceneManager.sceneData.currentSentenceId, sentenceId)
      : sentenceId;
  const fastPreviewElapsedMs = Math.round(performance.now() - fastPreviewStartTime - suspendedElapsedMs);
  if (forwardedLineCount < sentenceId && WebGAL.sceneManager.sceneData.currentScene.sceneName === currentSceneName) {
    const payload: IFastPreviewTimeoutPayload = {
      scene: WebGAL.sceneManager.sceneData.currentScene.sceneName,
      sentence: WebGAL.sceneManager.sceneData.currentSentenceId,
      targetSentence: sentenceId,
      forwardedLineCount,
      elapsedMs: fastPreviewElapsedMs,
      maxDurationMs: FAST_PREVIEW_SLOW_WARN_DURATION_MS,
    };
    logger.warn(
      `实时预览快进未到达目标语句，已快进 ${forwardedLineCount} 行，用时 ${payload.elapsedMs}ms`,
    );
    onFastPreviewTimeout?.(payload);
  }
  logger.info(`实时预览快进完成：快进 ${forwardedLineCount} 行，用时 ${fastPreviewElapsedMs}ms`);
}

function shouldContinueFastPreview(sentenceId: number, currentSceneName: string, baseSceneStackDepth: number) {
  const sceneData = WebGAL.sceneManager.sceneData;
  if (sceneData.currentScene.sceneName === currentSceneName) {
    return sceneData.currentSentenceId < sentenceId;
  }
  return sceneData.sceneStack.length > baseSceneStackDepth;
}

async function waitForPendingSceneWrite() {
  const sceneWritePromise = WebGAL.sceneManager.sceneWritePromise;
  if (!sceneWritePromise) {
    return false;
  }
  await sceneWritePromise;
  return true;
}

function yieldFastPreviewControl(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
