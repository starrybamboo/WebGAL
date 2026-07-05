import { DEFAULT_FIG_IN_DURATION, DEFAULT_FIG_OUT_DURATION } from '@/Core/constants';
import { IGameVar } from '@/Core/Modules/stage/stageInterface';
import { toSafeNumber } from '@/Core/util/toSafeType';

export const FIGURE_DEFAULT_ENTER_DURATION_KEY = 'Figure_Default_Enter_Duration';
export const FIGURE_DEFAULT_EXIT_DURATION_KEY = 'Figure_Default_Exit_Duration';
export const FIGURE_DEFAULT_ENTER_ANIMATION_KEY = 'Figure_Default_Enter_Animation';
export const FIGURE_DEFAULT_EXIT_ANIMATION_KEY = 'Figure_Default_Exit_Animation';

type FigureTransitionType = 'enter' | 'exit';

function getNormalizedGameVarValue(globalGameVar: IGameVar | undefined, key: string) {
  const rawValue = globalGameVar?.[key];
  return Array.isArray(rawValue) ? rawValue[0] : rawValue;
}

export function getConfiguredFigureDefaultTransitionDuration(
  globalGameVar: IGameVar | undefined,
  type: FigureTransitionType,
): number {
  const fallback = type === 'enter' ? DEFAULT_FIG_IN_DURATION : DEFAULT_FIG_OUT_DURATION;
  const key = type === 'enter' ? FIGURE_DEFAULT_ENTER_DURATION_KEY : FIGURE_DEFAULT_EXIT_DURATION_KEY;
  const normalizedValue = getNormalizedGameVarValue(globalGameVar, key);

  if (
    typeof normalizedValue !== 'string' &&
    typeof normalizedValue !== 'boolean' &&
    typeof normalizedValue !== 'number'
  ) {
    return fallback;
  }

  const duration = toSafeNumber(normalizedValue);
  if (duration == null || !Number.isFinite(duration) || duration < 0) {
    return fallback;
  }
  return Math.floor(duration);
}

export function getConfiguredFigureDefaultTransitionAnimation(
  globalGameVar: IGameVar | undefined,
  type: FigureTransitionType,
): string | null {
  const key = type === 'enter' ? FIGURE_DEFAULT_ENTER_ANIMATION_KEY : FIGURE_DEFAULT_EXIT_ANIMATION_KEY;
  const normalizedValue = getNormalizedGameVarValue(globalGameVar, key);
  if (typeof normalizedValue !== 'string') {
    return null;
  }
  const animationName = normalizedValue.trim();
  return animationName.length > 0 ? animationName : null;
}
