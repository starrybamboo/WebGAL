export const TUANCHAT_ROLE_IDS_VAR = 'tuanchat.roleIds';
export const TUANCHAT_COMBAT_ACTIVE_VAR = 'tuanchat.combat.active';
export const TUANCHAT_COMBAT_TURN_VAR = 'tuanchat.combat.turn';
export const TUANCHAT_MAP_BACKGROUND_VAR = 'tuanchat.map.background';
export const TUANCHAT_MAP_GRID_ROWS_VAR = 'tuanchat.map.gridRows';
export const TUANCHAT_MAP_GRID_COLS_VAR = 'tuanchat.map.gridCols';
export const TUANCHAT_MAP_GRID_COLOR_VAR = 'tuanchat.map.gridColor';
export const TUANCHAT_ROLE_AVATAR_URL_KEY = 'avatarUrl';

export function buildTuanChatRoleVarKey(roleId: number, key: string): string {
  return `tuanchat.role.${roleId}.${key.trim()}`;
}

export function buildTuanChatMapTokenVarKey(roleId: number, key: 'active' | 'rowIndex' | 'colIndex'): string {
  return `tuanchat.map.token.${roleId}.${key}`;
}
