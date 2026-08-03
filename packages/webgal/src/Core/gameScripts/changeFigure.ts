import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { IPerform } from '@/Core/Modules/perform/performInterface';
import cloneDeep from 'lodash/cloneDeep';
import {
  getBooleanArgByKey,
  getFigurePositionFromArgs,
  getNumberArgByKey,
  getStringArgByKey,
} from '@/Core/util/getSentenceArg';
import {
  baseTransform,
  figureStateKeyByPosition,
  IFreeFigure,
  ITransform,
} from '@/Core/Modules/stage/stageInterface';
import { AnimationFrame, IUserAnimation } from '@/Core/Modules/animations';
import { generateTransformAnimationObj } from '@/Core/controller/stage/pixi/animations/generateTransformAnimationObj';
import { generateTimelineObj } from '@/Core/controller/stage/pixi/animations/timeline';
import { assetSetter, fileType } from '@/Core/util/gameAssetsAccess/assetSetter';
import { logger } from '@/Core/util/logger';
import { applyAnimationEndState, getAnimateDuration } from '@/Core/Modules/animationFunctions';
import { WebGAL } from '@/Core/WebGAL';
import { baseBlinkParam, baseFocusParam, BlinkParam, FocusParam } from '@/Core/live2DCore';
import { WEBGAL_NONE } from '../constants';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { parseTransformFrame } from './parseTransformFrame';
import {
  getConfiguredFigureDefaultTransitionAnimation,
  getConfiguredFigureDefaultTransitionDuration,
} from '@/Core/util/figureTransitionConfig';
import { webgalStore } from '@/store/store';
/**
 * 更改立绘
 * @param sentence 语句
 */
// eslint-disable-next-line complexity
export function changeFigure(sentence: ISentence): IPerform {
  // 语句内容
  let content = sentence.content;
  if (content === WEBGAL_NONE) {
    content = '';
  }
  if (getBooleanArgByKey(sentence, 'clear')) {
    content = '';
  }
  // 根据参数设置指定位置
  const pos = getFigurePositionFromArgs(sentence) || 'center';

  // id 与 自由立绘
  let key = getStringArgByKey(sentence, 'id') ?? '';
  const isFreeFigure = key ? true : false;
  const id = key ? key : `fig-${pos}`;

  // live2d 或 spine 相关
  let motion = getStringArgByKey(sentence, 'motion') ?? '';
  const skin = getStringArgByKey(sentence, 'skin') ?? '';
  let expression = getStringArgByKey(sentence, 'expression') ?? '';
  const boundsFromArgs = getStringArgByKey(sentence, 'bounds') ?? '';
  let bounds = getOverrideBoundsArr(boundsFromArgs);

  let blink: BlinkParam | null = null;
  const blinkFromArgs = getStringArgByKey(sentence, 'blink');
  if (blinkFromArgs) {
    try {
      blink = JSON.parse(blinkFromArgs) as BlinkParam;
    } catch (error) {
      logger.error('Failed to parse blink parameter:', error);
    }
  }

  let focus: FocusParam | null = null;
  const focusFromArgs = getStringArgByKey(sentence, 'focus');
  if (focusFromArgs) {
    try {
      focus = JSON.parse(focusFromArgs) as FocusParam;
    } catch (error) {
      logger.error('Failed to parse focus parameter:', error);
    }
  }

  // 图片立绘差分
  const mouthOpen = optionalFigureAssetUrl(getStringArgByKey(sentence, 'mouthOpen'));
  const mouthClose = optionalFigureAssetUrl(getStringArgByKey(sentence, 'mouthClose'));
  const mouthHalfOpen = optionalFigureAssetUrl(getStringArgByKey(sentence, 'mouthHalfOpen'));
  const eyesOpen = optionalFigureAssetUrl(getStringArgByKey(sentence, 'eyesOpen'));
  const eyesClose = optionalFigureAssetUrl(getStringArgByKey(sentence, 'eyesClose'));
  const animationFlag = getStringArgByKey(sentence, 'animationFlag') ?? '';
  const figureAssociatedAnimationAssets = {
    mouthOpen,
    mouthClose,
    mouthHalfOpen,
    eyesOpen,
    eyesClose,
  };
  const enabledAssociatedAnimationAssets = Object.entries(figureAssociatedAnimationAssets).filter(([, url]) => url !== '');
  if (enabledAssociatedAnimationAssets.length === 0) {
    logger.info('[changeFigure] no associated animation assets', {
      content,
      id,
    });
  } else {
    const emptyAssociatedAnimationAssets = Object.entries(figureAssociatedAnimationAssets).filter(([, url]) =>
      isEmptyFigureAssetUrl(url),
    );
    if (emptyAssociatedAnimationAssets.length > 0) {
      logger.info('[changeFigure] empty associated animation assets', {
        content,
        id,
        emptyKeys: emptyAssociatedAnimationAssets.map(([key]) => key),
        values: Object.fromEntries(emptyAssociatedAnimationAssets),
      });
    }
    logger.info('[changeFigure] associated animation assets', {
      content,
      id,
      assetKeys: enabledAssociatedAnimationAssets.map(([key]) => key),
    });
  }

  // 其他参数
  const transformString = getStringArgByKey(sentence, 'transform');
  const ease = getStringArgByKey(sentence, 'ease') ?? '';
  const globalGameVar = webgalStore.getState().userData.globalGameVar;
  let duration = getNumberArgByKey(sentence, 'duration') ?? getConfiguredFigureDefaultTransitionDuration(globalGameVar, 'enter');
  const configuredDefaultEnterAnimation = getConfiguredFigureDefaultTransitionAnimation(globalGameVar, 'enter');
  const enterAnimation = getStringArgByKey(sentence, 'enter');
  const exitAnimation = getStringArgByKey(sentence, 'exit');
  let zIndex = getNumberArgByKey(sentence, 'zIndex') ?? -1;
  let blendMode = getStringArgByKey(sentence, 'blendMode');
  const enterDuration = getNumberArgByKey(sentence, 'enterDuration') ?? duration;
  duration = enterDuration;
  const exitDuration = getNumberArgByKey(sentence, 'exitDuration') ?? getConfiguredFigureDefaultTransitionDuration(globalGameVar, 'exit');
  const ignoreDefault = getBooleanArgByKey(sentence, 'ignoreDefault') ?? false;

  const currentFigureAssociatedAnimation = stageStateManager.getCalculationStageState().figureAssociatedAnimation;
  const filteredFigureAssociatedAnimation = currentFigureAssociatedAnimation.filter((item) => item.targetId !== id);
  const newFigureAssociatedAnimationItem = {
    targetId: id,
    animationFlag: animationFlag,
    mouthAnimation: {
      open: mouthOpen,
      close: mouthClose,
      halfOpen: mouthHalfOpen,
    },
    blinkAnimation: {
      open: eyesOpen,
      close: eyesClose,
    },
  };
  if (enabledAssociatedAnimationAssets.length > 0) {
    filteredFigureAssociatedAnimation.push(newFigureAssociatedAnimationItem);
  }
  stageStateManager.setStage('figureAssociatedAnimation', filteredFigureAssociatedAnimation);

  /**
   * 如果 url 没变，不移除
   */
  let isUrlChanged = true;
  if (key !== '') {
    const figWithKey = stageStateManager.getCalculationStageState().freeFigure.find((e) => e.key === key);
    if (figWithKey) {
      if (figWithKey.name === content) {
        isUrlChanged = false;
      }
    }
  } else if (stageStateManager.getCalculationStageState()[figureStateKeyByPosition[pos]] === content) {
    isUrlChanged = false;
  }
  /**
   * 处理 Effects
   */
  if (isUrlChanged) {
    // 必须先卸载旧的动画演出：它的 stopFunction 会写回终态，晚于清空 effects 会把旧变换复活
    WebGAL.gameplay.performController.unmountPerform(`animation-${id}`, true);
    stageStateManager.removeEffectByTargetId(id);
    stageStateManager.removeAnimationSettingsByTarget(id);
    if (stageStateManager.getCalculationStageState().speakingFigureKey === id) {
      stageStateManager.setStage('speakingFigureKey', '');
    }
    const oldStageObject = WebGAL.gameplay.pixiStage?.getStageObjByKey(id);
    if (oldStageObject) {
      oldStageObject.isExiting = true;
    }
  }
  const setAnimationNames = (targetKey: string) => {
    // 如果立绘被关闭了，那么就不用设置了
    if (content === '') {
      return;
    }
    const existingSetting = stageStateManager
      .getCalculationStageState()
      .animationSettings.find((setting) => setting.target === targetKey);
    const existingEnterAnimationName = existingSetting?.enterAnimationName;
    const hasKeepOffsetEnter = existingSetting?.enterKeepOffset ?? false;
    const configuredDefaultEnterAnimationAvailable =
      !!configuredDefaultEnterAnimation &&
      WebGAL.animationManager.getAnimations().some((animation) => animation.name === configuredDefaultEnterAnimation);
    const shouldUseConfiguredDefaultEnterAnimation = configuredDefaultEnterAnimationAvailable && !enterAnimation;
    const shouldGenerateEnterAnimation =
      !shouldUseConfiguredDefaultEnterAnimation && (!existingEnterAnimationName || !hasKeepOffsetEnter || !!enterAnimation);
    let didSetEnterAnimation = false;
    const frame = transformString ? parseTransformFrame(transformString) : null;
    const transformFrame = frame ?? ({} as AnimationFrame);
    const baseTransformForOffset = frame ? buildTransformFromFrame(frame) : cloneDeep(baseTransform);
    stageStateManager.updateAnimationSettings({
      target: targetKey,
      key: 'baseTransform',
      value: baseTransformForOffset,
    });

    if (shouldGenerateEnterAnimation) {
      const animationObj = generateTransformAnimationObj(targetKey, transformFrame, duration, ease, !ignoreDefault);
      // 因为是切换，必须把一开始的 alpha 改为 0
      animationObj[0].alpha = 0;
      const animationName = (Math.random() * 10).toString(16);
      const newAnimation: IUserAnimation = { name: animationName, effects: animationObj };
      WebGAL.animationManager.addAnimation(newAnimation);
      duration = getAnimateDuration(animationName);
      didSetEnterAnimation = true;
      stageStateManager.updateAnimationSettings({ target: targetKey, key: 'enterAnimationName', value: animationName });
    }

    stageStateManager.updateAnimationSettings({
      target: targetKey,
      key: 'enterAnimationIgnoreDefault',
      value: ignoreDefault,
    });

    if (enterAnimation) {
      stageStateManager.updateAnimationSettings({ target: targetKey, key: 'enterAnimationName', value: enterAnimation });
      duration = getAnimateDuration(enterAnimation);
      didSetEnterAnimation = true;
    } else if (shouldUseConfiguredDefaultEnterAnimation && configuredDefaultEnterAnimation) {
      stageStateManager.updateAnimationSettings({
        target: targetKey,
        key: 'enterAnimationName',
        value: configuredDefaultEnterAnimation,
      });
      stageStateManager.updateAnimationSettings({ target: targetKey, key: 'enterKeepOffset', value: true });
      duration = getAnimateDuration(configuredDefaultEnterAnimation);
      didSetEnterAnimation = true;
    } else if (configuredDefaultEnterAnimation && !configuredDefaultEnterAnimationAvailable) {
      logger.warn('未找到配置的默认立绘动画，回退内置动画', configuredDefaultEnterAnimation);
    }
    if (exitAnimation) {
      stageStateManager.updateAnimationSettings({ target: targetKey, key: 'exitAnimationName', value: exitAnimation });
      stageStateManager.updateAnimationSettings({
        target: targetKey,
        key: 'exitAnimationIgnoreDefault',
        value: ignoreDefault,
      });
      duration = getAnimateDuration(exitAnimation);
    }
    if (!didSetEnterAnimation && existingEnterAnimationName) {
      duration = getAnimateDuration(existingEnterAnimationName);
    }
    if (enterDuration >= 0) {
      stageStateManager.updateAnimationSettings({ target: targetKey, key: 'enterDuration', value: enterDuration });
    }
    if (exitDuration >= 0) {
      stageStateManager.updateAnimationSettings({ target: targetKey, key: 'exitDuration', value: exitDuration });
    }
  };

  function postFigureStateSet() {
    if (isUrlChanged) {
      // 当 url 发生变化时，即发生新立绘替换
      // 应当赋予一些参数以默认值，防止从旧立绘的状态获取数据
      bounds = bounds ?? [0, 0, 0, 0];
      blink = blink ?? cloneDeep(baseBlinkParam);
      focus = focus ?? cloneDeep(baseFocusParam);
      zIndex = Math.max(zIndex, 0);
      blendMode = blendMode ?? 'normal';
      stageStateManager.setLive2dMotion({ target: key, motion, skin, overrideBounds: bounds });
      stageStateManager.setLive2dExpression({ target: key, expression });
      stageStateManager.setLive2dBlink({ target: key, blink });
      stageStateManager.setLive2dFocus({ target: key, focus });
      stageStateManager.setFigureMetaData([key, 'zIndex', zIndex, false]);
      stageStateManager.setFigureMetaData([key, 'blendMode', blendMode, false]);
    } else {
      // 当 url 没有发生变化时，即没有新立绘替换
      // 应当保留旧立绘的状态，仅在需要时更新
      if (motion || skin || bounds) {
        stageStateManager.setLive2dMotion({ target: key, motion, skin, overrideBounds: bounds });
      }
      if (expression) {
        stageStateManager.setLive2dExpression({ target: key, expression });
      }
      if (blink) {
        stageStateManager.setLive2dBlink({ target: key, blink });
      }
      if (focus) {
        stageStateManager.setLive2dFocus({ target: key, focus });
      }
      if (zIndex >= 0) {
        stageStateManager.setFigureMetaData([key, 'zIndex', zIndex, false]);
      }
      if (blendMode) {
        stageStateManager.setFigureMetaData([key, 'blendMode', blendMode, false]);
      }
    }
  }

  if (isFreeFigure) {
    /**
     * 下面的代码是设置自由立绘的
     */
    const freeFigureItem: IFreeFigure = { key, name: content, basePosition: pos };
    setAnimationNames(key);
    postFigureStateSet();
    stageStateManager.setFreeFigureByKey(freeFigureItem);
  } else {
    /**
     * 下面的代码是设置与位置关联的立绘的
     */
    key = `fig-${pos}`;
    setAnimationNames(key);
    postFigureStateSet();
    stageStateManager.setStage(figureStateKeyByPosition[pos], content);
  }

  /**
   * 入场动画
   *
   * 终态在演算期写入 effects，演出只负责视觉过渡，因此不需要任何延迟结算。
   * 与 setTransform 共用 `animation-${key}` 演出名，同目标的动画冲突由演出去重统一裁决。
   */
  const enterAnimationSetting = stageStateManager
    .getCalculationStageState()
    .animationSettings.find((setting) => setting.target === key);
  const shouldAnimateExistingFigure =
    !isUrlChanged &&
    !WebGAL.gameplay.isFast &&
    (!!transformString ||
      !!enterAnimation ||
      !!exitAnimation ||
      !!enterAnimationSetting?.enterAnimationName ||
      !!enterAnimationSetting?.exitAnimationName);
  const shouldPlayEnterAnimation = content !== '' && (isUrlChanged || shouldAnimateExistingFigure);
  const enterAnimationName = enterAnimationSetting?.enterAnimationName;
  const enterAnimationTimeline = shouldPlayEnterAnimation && enterAnimationName
    ? applyAnimationEndState(
        enterAnimationName,
        key,
        false,
        !(enterAnimationSetting?.enterAnimationIgnoreDefault ?? false),
        enterAnimationSetting?.enterKeepOffset ?? false,
        enterAnimationSetting?.enterKeepOffset ? enterAnimationSetting.baseTransform : undefined,
      )
    : null;
  const enterAnimationDuration = enterAnimationName ? getAnimateDuration(enterAnimationName) : 0;
  if (enterAnimationTimeline) {
    duration = enterAnimationDuration;
  }
  const enterAnimationKey = `${key}-softin`;

  return {
    performName: shouldPlayEnterAnimation ? `animation-${key}` : `enter-${key}`,
    duration,
    isHoldOn: false,
    startFunction: () => {
      if (!enterAnimationTimeline || WebGAL.gameplay.skipAnimation) return;
      const animationObject = generateTimelineObj(enterAnimationTimeline, key, enterAnimationDuration);
      WebGAL.gameplay.pixiStage?.registerAnimation(animationObject, enterAnimationKey, key);
    },
    stopFunction: () => {
      WebGAL.gameplay.pixiStage?.removeAnimation(enterAnimationKey);
    },
    blockingNext: () => false,
    blockingAuto: () => true,
  };
}

function getOverrideBoundsArr(raw: string): undefined | [number, number, number, number] {
  const parseOverrideBoundsResult = raw.split(',').map((e) => Number(e));
  let isPass = true;
  parseOverrideBoundsResult.forEach((e) => {
    if (isNaN(e)) {
      isPass = false;
    }
  });
  isPass = isPass && parseOverrideBoundsResult.length === 4;
  if (isPass) return parseOverrideBoundsResult as [number, number, number, number];
  else return undefined;
}

function isEmptyFigureAssetUrl(url: string): boolean {
  return url === './game/figure/' || url.endsWith('/game/figure/');
}

function optionalFigureAssetUrl(fileName: string | null | undefined): string {
  const normalizedFileName = fileName?.trim() ?? '';
  if (normalizedFileName === '') return '';
  return assetSetter(normalizedFileName, fileType.figure);
}

function buildTransformFromFrame(frame: Partial<AnimationFrame>): ITransform {
  const transform = cloneDeep(baseTransform);
  if (frame.position) {
    transform.position = { ...transform.position, ...frame.position };
  }
  if (frame.scale) {
    transform.scale = { ...transform.scale, ...frame.scale };
  }
  const { position, scale, duration, ease, ...rest } = frame;
  const restTransform = transform as unknown as Record<string, unknown>;
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined) {
      restTransform[key] = value;
    }
  });
  return transform;
}
