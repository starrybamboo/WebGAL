import { IGameVar } from '@/Core/Modules/stage/stageInterface';
import { toSafeBoolean } from '@/Core/util/toSafeType';

export const ENABLE_SPEAKER_FOCUS_KEY = 'Enable_Speaker_Focus';

export function isSpeakerFocusEnabled(globalGameVar: IGameVar | undefined): boolean {
  const rawValue = globalGameVar?.[ENABLE_SPEAKER_FOCUS_KEY];
  const normalizedValue = Array.isArray(rawValue) ? rawValue[0] : rawValue;

  if (
    typeof normalizedValue === 'string' ||
    typeof normalizedValue === 'boolean' ||
    typeof normalizedValue === 'number'
  ) {
    return toSafeBoolean(normalizedValue) ?? true;
  }

  return true;
}
