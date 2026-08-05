import {
  FIGURE_POSITIONS,
  figureStateKeyByPosition,
  type IEffect,
  type IStageState,
} from '@/Core/Modules/stage/stageInterface';
import { WebGAL } from '@/Core/WebGAL';

const DEFAULT_SPEAKING_BRIGHTNESS_MULTIPLIER = 1;
const DEFAULT_IDLE_BRIGHTNESS_MULTIPLIER = 0.72;
const MAX_BRIGHTNESS = 3;

interface IApplySpeakerFocusOptions {
  speakingBrightnessMultiplier?: number;
  idleBrightnessMultiplier?: number;
}

export function applySpeakerFocusToPixi(
  stageState: IStageState,
  enabled: boolean,
  options: IApplySpeakerFocusOptions = {},
) {
  const pixiStage = WebGAL.gameplay.pixiStage;
  if (!pixiStage) {
    return;
  }

  const activeFigureKeys = getActiveFigureKeys(stageState);
  const focusedFigureKey = enabled ? stageState.speakingFigureKey : '';
  const hasFocusedFigure = Boolean(focusedFigureKey) && activeFigureKeys.includes(focusedFigureKey);
  const speakingBrightnessMultiplier =
    options.speakingBrightnessMultiplier ?? DEFAULT_SPEAKING_BRIGHTNESS_MULTIPLIER;
  const idleBrightnessMultiplier = options.idleBrightnessMultiplier ?? DEFAULT_IDLE_BRIGHTNESS_MULTIPLIER;
  let didChange = false;

  for (const key of activeFigureKeys) {
    const stageObject = pixiStage.getStageObjByKey(key);
    const container = stageObject?.pixiContainer;
    if (!container || stageObject?.isExiting) {
      continue;
    }

    const baseBrightness = getEffectBrightness(stageState.effects, key);
    const multiplier = hasFocusedFigure
      ? key === focusedFigureKey
        ? speakingBrightnessMultiplier
        : idleBrightnessMultiplier
      : 1;
    const nextBrightness = Math.max(0, Math.min(baseBrightness * multiplier, MAX_BRIGHTNESS));
    const currentBrightness = Number.isFinite(container.brightness) ? container.brightness : 1;

    if (Math.abs(currentBrightness - nextBrightness) > 0.001) {
      container.brightness = nextBrightness;
      didChange = true;
    }
  }

  if (didChange) {
    pixiStage.requestRender();
  }
}

function getActiveFigureKeys(stageState: IStageState) {
  const figureKeys: string[] = [];

  for (const position of FIGURE_POSITIONS) {
    if (stageState[figureStateKeyByPosition[position]]) {
      figureKeys.push(`fig-${position}`);
    }
  }

  for (const figure of stageState.freeFigure) {
    if (figure.name) {
      figureKeys.push(figure.key);
    }
  }

  return figureKeys;
}

function getEffectBrightness(effects: IEffect[], key: string) {
  return effects.find((effect) => effect.target === key)?.transform?.brightness ?? 1;
}
