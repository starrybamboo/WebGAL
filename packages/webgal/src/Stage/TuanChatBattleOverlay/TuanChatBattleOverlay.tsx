import React, { CSSProperties, FC, useEffect, useMemo, useState } from 'react';
import {
  buildTuanChatMapTokenVarKey,
  buildTuanChatRoleVarKey,
  TUANCHAT_COMBAT_ACTIVE_VAR,
  TUANCHAT_COMBAT_TURN_VAR,
  TUANCHAT_MAP_BACKGROUND_VAR,
  TUANCHAT_MAP_GRID_COLS_VAR,
  TUANCHAT_MAP_GRID_COLOR_VAR,
  TUANCHAT_MAP_GRID_ROWS_VAR,
  TUANCHAT_ROLE_AVATAR_URL_KEY,
  TUANCHAT_ROLE_IDS_VAR,
} from '@/Core/util/tuanChatGameVars';
import { assetSetter, fileType } from '@/Core/util/gameAssetsAccess/assetSetter';
import { useStageState } from '@/hooks/useStageState';
import type { IGameVar } from '@/Core/Modules/stage/stageInterface';
import styles from './tuanChatBattleOverlay.module.scss';

const TUANCHAT_BATTLE_OVERLAY_MESSAGE_TYPE = 'TUANCHAT_BATTLE_OVERLAY_SYNC';
const TUANCHAT_BATTLE_OVERLAY_READY_MESSAGE_TYPE = 'TUANCHAT_BATTLE_OVERLAY_READY';
const TUANCHAT_BATTLE_OVERLAY_SCHEMA_VERSION = 1;
const DEFAULT_GRID_COLOR = '#808080';

type GameVars = IGameVar;

type BattleOverlayRoleSnapshot = {
  roleId: number;
  name: string;
  avatarUrl: string;
  hp: number | null;
  maxHp: number | null;
  hpPercent: number | null;
  initiative: number | null;
  statuses: Array<{ instanceId: string; name: string; remainingTurns?: number }>;
  isCurrentActor: boolean;
};

type BattleOverlayMapTokenSnapshot = {
  roleId: number;
  rowIndex: number;
  colIndex: number;
  name: string;
  avatarUrl: string;
};

type BattleOverlayMapSnapshot = {
  imageUrl: string;
  gridRows: number;
  gridCols: number;
  gridColor: string;
  tokens: BattleOverlayMapTokenSnapshot[];
};

type BattleOverlaySnapshot = {
  schemaVersion: typeof TUANCHAT_BATTLE_OVERLAY_SCHEMA_VERSION;
  visible: boolean;
  roomId: number | null;
  round: number | null;
  currentActorRoleId: number | null;
  currentActorName: string;
  map: BattleOverlayMapSnapshot | null;
  roles: BattleOverlayRoleSnapshot[];
};

const EMPTY_SNAPSHOT: BattleOverlaySnapshot = {
  schemaVersion: TUANCHAT_BATTLE_OVERLAY_SCHEMA_VERSION,
  visible: false,
  roomId: null,
  round: null,
  currentActorRoleId: null,
  currentActorName: '',
  map: null,
  roles: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toPositiveInteger(value: unknown): number | null {
  const numberValue = toNumber(value);
  return numberValue != null && numberValue > 0 ? Math.trunc(numberValue) : null;
}

function toNonNegativeInteger(value: unknown): number | null {
  const numberValue = toNumber(value);
  return numberValue != null && numberValue >= 0 ? Math.trunc(numberValue) : null;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeGridColor(value: unknown): string {
  const color = toTrimmedString(value);
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : DEFAULT_GRID_COLOR;
}

function normalizeTokenName(roleId: number, name?: string): string {
  const trimmedName = name?.trim();
  return trimmedName || `#${roleId}`;
}

function normalizeRole(rawRole: unknown): BattleOverlayRoleSnapshot | null {
  if (!isRecord(rawRole)) {
    return null;
  }
  const roleId = toPositiveInteger(rawRole.roleId);
  if (!roleId) {
    return null;
  }
  return {
    roleId,
    name: toTrimmedString(rawRole.name) || `#${roleId}`,
    avatarUrl: toTrimmedString(rawRole.avatarUrl),
    hp: toNumber(rawRole.hp),
    maxHp: toNumber(rawRole.maxHp),
    hpPercent: toNumber(rawRole.hpPercent),
    initiative: toNumber(rawRole.initiative),
    statuses: [],
    isCurrentActor: rawRole.isCurrentActor === true,
  };
}

function normalizeMapToken(rawToken: unknown): BattleOverlayMapTokenSnapshot | null {
  if (!isRecord(rawToken)) {
    return null;
  }
  const roleId = toPositiveInteger(rawToken.roleId);
  const rowIndex = toNonNegativeInteger(rawToken.rowIndex);
  const colIndex = toNonNegativeInteger(rawToken.colIndex);
  if (!roleId || rowIndex == null || colIndex == null) {
    return null;
  }
  return {
    roleId,
    rowIndex,
    colIndex,
    name: normalizeTokenName(roleId, toTrimmedString(rawToken.name)),
    avatarUrl: toTrimmedString(rawToken.avatarUrl),
  };
}

function normalizeMap(rawMap: unknown): BattleOverlayMapSnapshot | null {
  if (!isRecord(rawMap)) {
    return null;
  }
  const gridRows = toPositiveInteger(rawMap.gridRows) ?? 10;
  const gridCols = toPositiveInteger(rawMap.gridCols) ?? 10;
  return {
    imageUrl: toTrimmedString(rawMap.imageUrl),
    gridRows,
    gridCols,
    gridColor: normalizeGridColor(rawMap.gridColor),
    tokens: (Array.isArray(rawMap.tokens) ? rawMap.tokens : [])
      .map(normalizeMapToken)
      .filter((token): token is BattleOverlayMapTokenSnapshot => Boolean(token)),
  };
}

function normalizeBattleOverlaySnapshot(value: unknown): BattleOverlaySnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== TUANCHAT_BATTLE_OVERLAY_SCHEMA_VERSION || typeof value.visible !== 'boolean') {
    return null;
  }
  return {
    schemaVersion: TUANCHAT_BATTLE_OVERLAY_SCHEMA_VERSION,
    visible: value.visible,
    roomId: toPositiveInteger(value.roomId),
    round: toNonNegativeInteger(value.round),
    currentActorRoleId: toPositiveInteger(value.currentActorRoleId),
    currentActorName: toTrimmedString(value.currentActorName),
    map: normalizeMap(value.map),
    roles: (Array.isArray(value.roles) ? value.roles : [])
      .map(normalizeRole)
      .filter((role): role is BattleOverlayRoleSnapshot => Boolean(role)),
  };
}

function readBattleOverlayMessage(data: unknown): BattleOverlaySnapshot | null {
  if (!isRecord(data) || data.type !== TUANCHAT_BATTLE_OVERLAY_MESSAGE_TYPE) {
    return null;
  }
  return normalizeBattleOverlaySnapshot(data.payload);
}

function readGameVarNumber(gameVars: GameVars, key: string): number | null {
  const value = gameVars[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readGameVarBoolean(gameVars: GameVars, key: string): boolean | null {
  const value = gameVars[key];
  return typeof value === 'boolean' ? value : null;
}

function readGameVarString(gameVars: GameVars, key: string): string {
  const value = gameVars[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readNumberListVar(gameVars: GameVars, key: string): number[] {
  return readGameVarString(gameVars, key)
    .split(',')
    .map(item => toPositiveInteger(item))
    .filter((item): item is number => item != null);
}

function collectRoleIdsFromGameVars(gameVars: GameVars): Set<number> {
  const roleIds = new Set<number>();
  if (Object.prototype.hasOwnProperty.call(gameVars, TUANCHAT_ROLE_IDS_VAR)) {
    readNumberListVar(gameVars, TUANCHAT_ROLE_IDS_VAR).forEach(roleId => roleIds.add(roleId));
    return roleIds;
  }
  Object.keys(gameVars).forEach((key) => {
    const match = key.match(/^tuanchat\.role\.(\d+)\./);
    const roleId = match ? toPositiveInteger(match[1]) : null;
    if (roleId) {
      roleIds.add(roleId);
    }
  });
  return roleIds;
}

function collectMapTokenRoleIdsFromGameVars(gameVars: GameVars): Set<number> {
  const roleIds = new Set<number>();
  Object.keys(gameVars).forEach((key) => {
    const match = key.match(/^tuanchat\.map\.token\.(\d+)\.(active|rowIndex|colIndex)$/);
    const roleId = match ? toPositiveInteger(match[1]) : null;
    if (roleId) {
      roleIds.add(roleId);
    }
  });
  return roleIds;
}

function clampHpPercent(hp: number | null, maxHp: number | null): number | null {
  if (hp == null || maxHp == null || maxHp <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
}

function readRoleNumber(gameVars: GameVars, roleId: number, keys: string[]): number | null {
  for (const key of keys) {
    const value = readGameVarNumber(gameVars, buildTuanChatRoleVarKey(roleId, key));
    if (value != null) {
      return value;
    }
  }
  return null;
}

function readRoleString(gameVars: GameVars, roleId: number, key: string): string {
  return readGameVarString(gameVars, buildTuanChatRoleVarKey(roleId, key));
}

function buildRolesFromGameVars(baseSnapshot: BattleOverlaySnapshot, gameVars: GameVars): BattleOverlayRoleSnapshot[] {
  const baseRolesById = new Map(baseSnapshot.roles.map(role => [role.roleId, role] as const));
  const roleIds = collectRoleIdsFromGameVars(gameVars);
  baseSnapshot.roles.forEach(role => roleIds.add(role.roleId));

  return [...roleIds]
    .map((roleId): BattleOverlayRoleSnapshot => {
      const baseRole = baseRolesById.get(roleId);
      const hp = readRoleNumber(gameVars, roleId, ['hp']) ?? baseRole?.hp ?? null;
      const maxHp = readRoleNumber(gameVars, roleId, ['maxHp', 'maxhp', 'hpMax', 'hpmax']) ?? baseRole?.maxHp ?? null;
      const initiative = readRoleNumber(gameVars, roleId, ['initiative']) ?? baseRole?.initiative ?? null;
      return {
        roleId,
        name: baseRole?.name ?? `#${roleId}`,
        avatarUrl: readRoleString(gameVars, roleId, TUANCHAT_ROLE_AVATAR_URL_KEY) || baseRole?.avatarUrl || '',
        hp,
        maxHp,
        hpPercent: clampHpPercent(hp, maxHp),
        initiative,
        statuses: baseRole?.statuses ?? [],
        isCurrentActor: false,
      };
    })
    .sort((left, right) => (right.initiative ?? Number.NEGATIVE_INFINITY) - (left.initiative ?? Number.NEGATIVE_INFINITY) || left.name.localeCompare(right.name));
}

function resolveCurrentActorRoleId(
  visible: boolean,
  roles: BattleOverlayRoleSnapshot[],
  fallbackRoleId: number | null,
): number | null {
  if (!visible) {
    return null;
  }
  const withInitiative = roles.filter(role => role.initiative != null);
  if (withInitiative.length > 0) {
    return withInitiative[0].roleId;
  }
  return roles.some(role => role.roleId === fallbackRoleId) ? fallbackRoleId : null;
}

function resolveMapBackgroundImageUrl(rawBackground: string): string {
  const background = rawBackground.trim();
  if (!background) {
    return '';
  }
  return assetSetter(background, fileType.background);
}

function buildMapFromGameVars(baseSnapshot: BattleOverlaySnapshot, gameVars: GameVars): BattleOverlayMapSnapshot | null {
  const baseMap = baseSnapshot.map;
  const hasBackgroundVar = Object.prototype.hasOwnProperty.call(gameVars, TUANCHAT_MAP_BACKGROUND_VAR);
  const background = readGameVarString(gameVars, TUANCHAT_MAP_BACKGROUND_VAR);
  // 场景初始化会写入空 background；预览模式下不能因此抹掉宿主同步来的房间地图。
  if (hasBackgroundVar && !background && !baseMap) {
    return null;
  }
  const imageUrl = hasBackgroundVar
    ? (background ? resolveMapBackgroundImageUrl(background) : baseMap?.imageUrl ?? '')
    : baseMap?.imageUrl ?? '';
  const gridRows = readGameVarNumber(gameVars, TUANCHAT_MAP_GRID_ROWS_VAR) ?? baseMap?.gridRows ?? 10;
  const gridCols = readGameVarNumber(gameVars, TUANCHAT_MAP_GRID_COLS_VAR) ?? baseMap?.gridCols ?? 10;
  const gridColor = normalizeGridColor(readGameVarString(gameVars, TUANCHAT_MAP_GRID_COLOR_VAR) || baseMap?.gridColor || DEFAULT_GRID_COLOR);
  const baseRolesById = new Map(baseSnapshot.roles.map(role => [role.roleId, role] as const));
  const baseTokensByRoleId = new Map((baseMap?.tokens ?? []).map(token => [token.roleId, token] as const));
  const tokenRoleIds = collectMapTokenRoleIdsFromGameVars(gameVars);
  const hasTokenVars = tokenRoleIds.size > 0;
  const tokens = hasTokenVars
    ? [...tokenRoleIds]
        .map((roleId): BattleOverlayMapTokenSnapshot | null => {
          const active = readGameVarBoolean(gameVars, buildTuanChatMapTokenVarKey(roleId, 'active'));
          const rowIndex = readGameVarNumber(gameVars, buildTuanChatMapTokenVarKey(roleId, 'rowIndex'));
          const colIndex = readGameVarNumber(gameVars, buildTuanChatMapTokenVarKey(roleId, 'colIndex'));
          if (active === false || rowIndex == null || colIndex == null) {
            return null;
          }
          const baseToken = baseTokensByRoleId.get(roleId);
          const baseRole = baseRolesById.get(roleId);
          return {
            roleId,
            rowIndex,
            colIndex,
            name: baseToken?.name ?? baseRole?.name ?? normalizeTokenName(roleId),
            avatarUrl: readRoleString(gameVars, roleId, TUANCHAT_ROLE_AVATAR_URL_KEY),
          };
        })
        .filter((token): token is BattleOverlayMapTokenSnapshot => Boolean(token))
    : baseMap?.tokens ?? [];

  if (!imageUrl && !baseMap && tokens.length === 0) {
    return null;
  }
  return {
    imageUrl,
    gridRows,
    gridCols,
    gridColor,
    tokens,
  };
}

function buildSnapshotFromGameVars(baseSnapshot: BattleOverlaySnapshot, gameVars: GameVars): BattleOverlaySnapshot {
  const combatVisible = readGameVarBoolean(gameVars, TUANCHAT_COMBAT_ACTIVE_VAR) ?? baseSnapshot.visible;
  const roles = buildRolesFromGameVars(baseSnapshot, gameVars);
  const map = buildMapFromGameVars(baseSnapshot, gameVars);
  const visible = combatVisible || map !== null;
  const currentActorRoleId = resolveCurrentActorRoleId(combatVisible, roles, baseSnapshot.currentActorRoleId);
  const currentActorName = currentActorRoleId != null
    ? roles.find(role => role.roleId === currentActorRoleId)?.name ?? ''
    : '';
  return {
    ...baseSnapshot,
    visible,
    round: combatVisible ? readGameVarNumber(gameVars, TUANCHAT_COMBAT_TURN_VAR) ?? baseSnapshot.round : null,
    currentActorRoleId,
    currentActorName,
    map,
    roles: visible ? roles.map(role => ({
      ...role,
      isCurrentActor: role.roleId === currentActorRoleId,
    })) : [],
  };
}

function buildGridStyle(map: BattleOverlayMapSnapshot): CSSProperties {
  return {
    '--tc-battle-grid-color': map.gridColor,
    backgroundImage: [
      `linear-gradient(to right, ${map.gridColor} var(--tc-battle-grid-line-width), transparent var(--tc-battle-grid-line-width))`,
      `linear-gradient(to bottom, ${map.gridColor} var(--tc-battle-grid-line-width), transparent var(--tc-battle-grid-line-width))`,
    ].join(', '),
    backgroundSize: `${100 / map.gridCols}% ${100 / map.gridRows}%`,
  } as CSSProperties;
}

function buildTokenStyle(token: BattleOverlayMapTokenSnapshot, map: BattleOverlayMapSnapshot): CSSProperties {
  return {
    left: `${((token.colIndex + 0.5) / map.gridCols) * 100}%`,
    top: `${((token.rowIndex + 0.5) / map.gridRows) * 100}%`,
  };
}

function postReadyMessage(): void {
  if (typeof window === 'undefined' || window.parent === window) {
    return;
  }
  window.parent.postMessage({
    type: TUANCHAT_BATTLE_OVERLAY_READY_MESSAGE_TYPE,
    schemaVersion: TUANCHAT_BATTLE_OVERLAY_SCHEMA_VERSION,
  }, '*');
}

export const TuanChatBattleOverlay: FC = () => {
  const gameVars = useStageState().GameVar;
  const [baseSnapshot, setBaseSnapshot] = useState<BattleOverlaySnapshot>(EMPTY_SNAPSHOT);
  const snapshot = useMemo(() => buildSnapshotFromGameVars(baseSnapshot, gameVars), [baseSnapshot, gameVars]);
  const map = snapshot.visible ? snapshot.map : null;

  useEffect(() => {
    postReadyMessage();
    const handleMessage = (event: MessageEvent<unknown>) => {
      const nextSnapshot = readBattleOverlayMessage(event.data);
      if (!nextSnapshot) {
        return;
      }
      setBaseSnapshot(nextSnapshot);
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  if (!snapshot.visible || !map) {
    return null;
  }

  return (
    <div className={styles.overlayRoot}>
      <div className={styles.mapFrame}>
        {map.imageUrl ? <img className={styles.mapImage} src={map.imageUrl} alt="" /> : <div className={styles.emptyMap} />}
        <div className={styles.grid} style={buildGridStyle(map)} />
        {map.tokens.map((token) => (
          <div
            key={token.roleId}
            className={styles.token}
            style={buildTokenStyle(token, map)}
            title={token.name}
          >
            {token.avatarUrl
              ? <img className={styles.tokenImage} src={token.avatarUrl} alt="" />
              : <span className={styles.tokenLabel}>{token.name.replace(/^#/, '')}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
