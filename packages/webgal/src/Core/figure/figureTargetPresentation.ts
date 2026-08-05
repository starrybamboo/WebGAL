import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { createNonePerform, IPerform } from '@/Core/Modules/perform/performInterface';
import cloneDeep from 'lodash/cloneDeep';
import {
  getBooleanArgByKey,
  getNumberArgByKey,
  getStringArgByKey,
} from '@/Core/util/getSentenceArg';
import {
  baseTransform,
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
import { parseTransformFrame } from '@/Core/gameScripts/parseTransformFrame';
import {
  getConfiguredFigureDefaultTransitionAnimation,
  getConfiguredFigureDefaultTransitionDuration,
} from '@/Core/util/figureTransitionConfig';
import { webgalStore } from '@/store/store';
import {
  getFigureTargetSource,
  resolveFigureTarget,
  setFigureTargetSource,
  type IFigureTarget,
} from './figureTarget';

export interface IFigureTargetPresentationOptions {
  source?: string;
  staticOnly?: boolean;
  deferUntilSourceReady?: boolean;
}
/**
 * 更改立绘
 * @param sentence 语句
 */
// eslint-disable-next-line complexity
export function presentFigureTarget(
  sentence: ISentence,
  options: IFigureTargetPresentationOptions = {},
): IPerform {
  // 语句内容
  let content = options.source ?? sentence.content;
  if (content === WEBGAL_NONE) {
    content = '';
  }
  if (getBooleanArgByKey(sentence, 'clear')) {
    content = '';
  }
  // 根据参数设置指定位置
  const target = resolveFigureTarget(sentence);
  const key = target.key;
  const id = target.key;

  // live2d 或 spine 相关
  let motion = options.staticOnly ? '' : getStringArgByKey(sentence, 'motion') ?? '';
  const skin = options.staticOnly ? '' : getStringArgByKey(sentence, 'skin') ?? '';
  let expression = options.staticOnly ? '' : getStringArgByKey(sentence, 'expression') ?? '';
  const boundsFromArgs = options.staticOnly ? '' : getStringArgByKey(sentence, 'bounds') ?? '';
  let bounds = getOverrideBoundsArr(boundsFromArgs);

  let blink: BlinkParam | null = null;
  const blinkFromArgs = options.staticOnly ? null : getStringArgByKey(sentence, 'blink');
  if (blinkFromArgs) {
    try {
      blink = JSON.parse(blinkFromArgs) as BlinkParam;
    } catch (error) {
      logger.error('Failed to parse blink parameter:', error);
    }
  }

  let focus: FocusParam | null = null;
  const focusFromArgs = options.staticOnly ? null : getStringArgByKey(sentence, 'focus');
  if (focusFromArgs) {
    try {
      focus = JSON.parse(focusFromArgs) as FocusParam;
    } catch (error) {
      logger.error('Failed to parse focus parameter:', error);
    }
  }

  // 图片立绘差分
  const mouthOpen = options.staticOnly ? '' : optionalFigureAssetUrl(getStringArgByKey(sentence, 'mouthOpen'));
  const mouthClose = options.staticOnly ? '' : optionalFigureAssetUrl(getStringArgByKey(sentence, 'mouthClose'));
  const mouthHalfOpen = options.staticOnly ? '' : optionalFigureAssetUrl(getStringArgByKey(sentence, 'mouthHalfOpen'));
  const eyesOpen = options.staticOnly ? '' : optionalFigureAssetUrl(getStringArgByKey(sentence, 'eyesOpen'));
  const eyesClose = options.staticOnly ? '' : optionalFigureAssetUrl(getStringArgByKey(sentence, 'eyesClose'));
  const animationFlag = options.staticOnly ? '' : getStringArgByKey(sentence, 'animationFlag') ?? '';
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
  const isUrlChanged = getFigureTargetSource(stageStateManager.getCalculationStageState(), target) !== content;
  /**
   * 处理 Effects
   */
  if (isUrlChanged) {
    prepareFigureTargetSourceChange(id);
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
    if (frame || isUrlChanged) {
      stageStateManager.updateEffect({ target: targetKey, transform: cloneDeep(baseTransformForOffset) });
    }
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
    if (options.staticOnly) {
      if (isUrlChanged) {
        stageStateManager.clearFigureResourceState(key);
        zIndex = Math.max(zIndex, 0);
        blendMode = blendMode ?? 'normal';
      }
      if (zIndex >= 0) {
        stageStateManager.setFigureMetaData([key, 'zIndex', zIndex, false]);
      }
      if (blendMode) {
        stageStateManager.setFigureMetaData([key, 'blendMode', blendMode, false]);
      }
      return;
    }
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

  // 新目标先进入 Figure 状态，effects 才能通过活动目标校验并写入稳定终态。
  if (content !== '') {
    setFigureTargetSource(target, content);
  }
  setAnimationNames(key);
  postFigureStateSet();
  if (content === '') {
    setFigureTargetSource(target, content);
  }
  if (options.deferUntilSourceReady) {
    // Character 组合图异步就绪后由共享 Figure 同步器只演出一次，避免旧纹理先启动同一动画。
    return createNonePerform();
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

export function clearFigureTarget(target: IFigureTarget): void {
  if (!getFigureTargetSource(stageStateManager.getCalculationStageState(), target)) {
    return;
  }
  prepareFigureTargetSourceChange(target.key);
  stageStateManager.clearFigureResourceState(target.key);
  stageStateManager.setFigureMetaData([target.key, 'zIndex', undefined, true]);
  setFigureTargetSource(target, '');
}

function prepareFigureTargetSourceChange(target: string): void {
  // stopFunction 可能写回动画终态，必须在清理 effects 前先卸载旧演出。
  WebGAL.gameplay.performController.unmountPerform(`animation-${target}`, true);
  stageStateManager.removeEffectByTargetId(target);
  stageStateManager.removeAnimationSettingsByTarget(target);
  if (stageStateManager.getCalculationStageState().speakingFigureKey === target) {
    stageStateManager.setStage('speakingFigureKey', '');
  }
  const oldStageObject = WebGAL.gameplay.pixiStage?.getStageObjByKey(target);
  if (oldStageObject) {
    oldStageObject.isExiting = true;
  }
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
