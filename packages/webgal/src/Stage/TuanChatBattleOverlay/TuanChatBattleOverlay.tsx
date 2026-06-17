import React, { CSSProperties, FC, useEffect, useMemo, useState } from 'react';
import {
  buildTuanChatRoleVarKey,
  TUANCHAT_COMBAT_ACTIVE_VAR,
  TUANCHAT_COMBAT_TURN_VAR,
  TUANCHAT_ROLE_IDS_VAR,
} from '@/Core/util/tuanChatGameVars';
import { useStageState } from '@/hooks/useStageState';
import { createInitialTuanChatMapState, type IGameVar, type IStageState, type ITuanChatMapState } from '@/Core/Modules/stage/stageInterface';
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

function buildRolesFromGameVars(
  baseSnapshot: BattleOverlaySnapshot,
  gameVars: GameVars,
  mapState: ITuanChatMapState,
): BattleOverlayRoleSnapshot[] {
  const baseRolesById = new Map(baseSnapshot.roles.map(role => [role.roleId, role] as const));
  const roleIds = collectRoleIdsFromGameVars(gameVars);
  baseSnapshot.roles.forEach(role => roleIds.add(role.roleId));
  mapState.tokens.forEach(token => roleIds.add(token.roleId));

  return [...roleIds]
    .map((roleId): BattleOverlayRoleSnapshot => {
      const baseRole = baseRolesById.get(roleId);
      const hp = readRoleNumber(gameVars, roleId, ['hp']) ?? baseRole?.hp ?? null;
      const maxHp = readRoleNumber(gameVars, roleId, ['maxHp', 'maxhp', 'hpMax', 'hpmax']) ?? baseRole?.maxHp ?? null;
      const initiative = readRoleNumber(gameVars, roleId, ['initiative']) ?? baseRole?.initiative ?? null;
      return {
        roleId,
        name: baseRole?.name ?? `#${roleId}`,
        avatarUrl: baseRole?.avatarUrl || '',
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

function buildMapFromTuanChatMapState(
  baseSnapshot: BattleOverlaySnapshot,
  mapState: ITuanChatMapState,
): BattleOverlayMapSnapshot | null {
  const baseRolesById = new Map(baseSnapshot.roles.map(role => [role.roleId, role] as const));
  const tokens = mapState.tokens.map((token): BattleOverlayMapTokenSnapshot => {
    const baseRole = baseRolesById.get(token.roleId);
    return {
      roleId: token.roleId,
      rowIndex: token.rowIndex,
      colIndex: token.colIndex,
      name: token.name || baseRole?.name || normalizeTokenName(token.roleId),
      avatarUrl: token.avatarUrl || baseRole?.avatarUrl || '',
    };
  });

  if (!mapState.visible && !mapState.configActive && !mapState.imageUrl && tokens.length === 0) {
    return null;
  }
  return {
    imageUrl: mapState.imageUrl,
    gridRows: mapState.gridRows,
    gridCols: mapState.gridCols,
    gridColor: normalizeGridColor(mapState.gridColor || DEFAULT_GRID_COLOR),
    tokens,
  };
}

function buildSnapshotFromStageState(baseSnapshot: BattleOverlaySnapshot, stageState: IStageState): BattleOverlaySnapshot {
  const gameVars = stageState.GameVar;
  const mapState = stageState.tuanChatMap ?? createInitialTuanChatMapState();
  const combatVisible = readGameVarBoolean(gameVars, TUANCHAT_COMBAT_ACTIVE_VAR) ?? (baseSnapshot.round != null);
  const roles = buildRolesFromGameVars(baseSnapshot, gameVars, mapState);
  const map = buildMapFromTuanChatMapState(baseSnapshot, mapState);
  const overlayVisible = mapState.visible;
  const visible = combatVisible || overlayVisible;
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
  const stageState = useStageState();
  const [baseSnapshot, setBaseSnapshot] = useState<BattleOverlaySnapshot>(EMPTY_SNAPSHOT);
  const snapshot = useMemo(() => buildSnapshotFromStageState(baseSnapshot, stageState), [baseSnapshot, stageState]);
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
