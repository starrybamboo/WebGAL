export const TUANCHAT_ROLE_IDS_VAR = 'tuanchat.roleIds';
export const TUANCHAT_COMBAT_ACTIVE_VAR = 'tuanchat.combat.active';
export const TUANCHAT_COMBAT_TURN_VAR = 'tuanchat.combat.turn';

export function buildTuanChatRoleVarKey(roleId: number, key: string): string {
  return `tuanchat.role.${roleId}.${key.trim()}`;
}
