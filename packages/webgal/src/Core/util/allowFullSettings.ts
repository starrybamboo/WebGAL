import { toSafeBoolean } from '@/Core/util/toSafeType';
import { IGameVar } from '@/Core/Modules/stage/stageInterface';

export const ALLOW_FULL_SETTINGS_KEY = 'Allow_Full_Settings';

export function isAllowFullSettingsEnabled(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 ? isAllowFullSettingsEnabled(value[0]) : true;
  }
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return toSafeBoolean(value) ?? true;
  }
  return true;
}

export function isAllowFullSettingsEnabledFromGameVar(globalGameVar: IGameVar | undefined): boolean {
  return isAllowFullSettingsEnabled(globalGameVar?.[ALLOW_FULL_SETTINGS_KEY]);
}
