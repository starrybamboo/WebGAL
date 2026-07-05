import React, { CSSProperties, FC, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildTuanChatRoleVarKey,
  TUANCHAT_COMBAT_ACTIVE_VAR,
  TUANCHAT_COMBAT_TURN_VAR,
  TUANCHAT_ROLE_IDS_VAR,
} from '@/Core/util/tuanChatGameVars';
import { useStageState } from '@/hooks/useStageState';
import { createInitialTuanChatMapState, type IGameVar, type IStageState, type ITuanChatMapState } from '@/Core/Modules/stage/stageInterface';
import {
  TUANCHAT_MAP_ENTER_ANIMATION_MS,
  TUANCHAT_MAP_EXIT_ANIMATION_MS,
  TUANCHAT_TOKEN_MOVE_ANIMATION_MS,
} from '@/Core/gameScripts/tuanChatMapTimings';
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
  previousRowIndex: number | null;
  previousColIndex: number | null;
  moveRevision: number;
  moveSegments: BattleOverlayTokenMoveSegment[];
  name: string;
  avatarUrl: string;
};

type BattleOverlayTokenMoveSegment = {
  fromRowIndex: number;
  fromColIndex: number;
  toRowIndex: number;
  toColIndex: number;
  revision: number;
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

type MapPresenceState = 'hidden' | 'entering' | 'visible' | 'exiting';

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

function normalizeTokenMoveSegment(rawSegment: unknown): BattleOverlayTokenMoveSegment | null {
  if (!isRecord(rawSegment)) {
    return null;
  }
  const fromRowIndex = toNonNegativeInteger(rawSegment.fromRowIndex);
  const fromColIndex = toNonNegativeInteger(rawSegment.fromColIndex);
  const toRowIndex = toNonNegativeInteger(rawSegment.toRowIndex);
  const toColIndex = toNonNegativeInteger(rawSegment.toColIndex);
  const revision = toNonNegativeInteger(rawSegment.revision);
  if (fromRowIndex == null || fromColIndex == null || toRowIndex == null || toColIndex == null || revision == null) {
    return null;
  }
  return {
    fromRowIndex,
    fromColIndex,
    toRowIndex,
    toColIndex,
    revision,
  };
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
    previousRowIndex: toNonNegativeInteger(rawToken.previousRowIndex),
    previousColIndex: toNonNegativeInteger(rawToken.previousColIndex),
    moveRevision: toNonNegativeInteger(rawToken.moveRevision) ?? 0,
    moveSegments: (Array.isArray(rawToken.moveSegments) ? rawToken.moveSegments : [])
      .map(normalizeTokenMoveSegment)
      .filter((segment): segment is BattleOverlayTokenMoveSegment => Boolean(segment)),
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
      previousRowIndex: token.previousRowIndex ?? null,
      previousColIndex: token.previousColIndex ?? null,
      moveRevision: token.moveRevision ?? 0,
      moveSegments: token.moveSegments ?? [],
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

function buildTokenPositionPercent(rowIndex: number, colIndex: number, map: BattleOverlayMapSnapshot) {
  return {
    left: `${((colIndex + 0.5) / map.gridCols) * 100}%`,
    top: `${((rowIndex + 0.5) / map.gridRows) * 100}%`,
  };
}

function buildTokenStyle(token: BattleOverlayMapTokenSnapshot, map: BattleOverlayMapSnapshot): CSSProperties {
  const targetPosition = buildTokenPositionPercent(token.rowIndex, token.colIndex, map);
  if (token.previousRowIndex == null || token.previousColIndex == null) {
    return targetPosition;
  }
  const sourcePosition = buildTokenPositionPercent(token.previousRowIndex, token.previousColIndex, map);
  return {
    ...targetPosition,
    '--tc-token-move-from-left': sourcePosition.left,
    '--tc-token-move-from-top': sourcePosition.top,
    '--tc-token-move-to-left': targetPosition.left,
    '--tc-token-move-to-top': targetPosition.top,
  } as CSSProperties;
}

function buildTokenMoveSegmentKey(token: BattleOverlayMapTokenSnapshot, segment: BattleOverlayTokenMoveSegment): string {
  return `${token.roleId}:${segment.revision}`;
}

function getNextPendingTokenMoveSegment(
  token: BattleOverlayMapTokenSnapshot,
  playedMoveKeys: Set<string>,
): BattleOverlayTokenMoveSegment | null {
  return token.moveSegments.find(segment => !playedMoveKeys.has(buildTokenMoveSegmentKey(token, segment))) ?? null;
}

function buildTokenForMoveSegment(
  token: BattleOverlayMapTokenSnapshot,
  segment: BattleOverlayTokenMoveSegment,
): BattleOverlayMapTokenSnapshot {
  return {
    ...token,
    rowIndex: segment.toRowIndex,
    colIndex: segment.toColIndex,
    previousRowIndex: segment.fromRowIndex,
    previousColIndex: segment.fromColIndex,
    moveRevision: segment.revision,
  };
}

function buildTokenRenderState(
  token: BattleOverlayMapTokenSnapshot,
  playedMoveKeys: Set<string>,
): { token: BattleOverlayMapTokenSnapshot; moveKey: string } {
  const segment = getNextPendingTokenMoveSegment(token, playedMoveKeys);
  if (!segment) {
    return { token, moveKey: '' };
  }
  return {
    token: buildTokenForMoveSegment(token, segment),
    moveKey: buildTokenMoveSegmentKey(token, segment),
  };
}

function collectNextPendingTokenMoveKeys(map: BattleOverlayMapSnapshot, playedMoveKeys: Set<string>): string[] {
  return map.tokens
    .map(token => {
      const segment = getNextPendingTokenMoveSegment(token, playedMoveKeys);
      return segment ? buildTokenMoveSegmentKey(token, segment) : '';
    })
    .filter((moveKey): moveKey is string => Boolean(moveKey));
}

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function getMapPresenceClass(presenceState: MapPresenceState): string {
  if (presenceState === 'entering') {
    return styles.overlayRootEntering;
  }
  if (presenceState === 'visible') {
    return styles.overlayRootVisible;
  }
  if (presenceState === 'exiting') {
    return styles.overlayRootExiting;
  }
  return styles.overlayRootHidden;
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
  const activeMap = snapshot.visible ? snapshot.map : null;
  const [renderedMap, setRenderedMap] = useState<BattleOverlayMapSnapshot | null>(activeMap);
  const [mapPresenceState, setMapPresenceState] = useState<MapPresenceState>('hidden');
  const [movePlaybackTick, setMovePlaybackTick] = useState(0);
  const isMapMountedRef = useRef(false);
  const mapPresenceStateRef = useRef<MapPresenceState>('hidden');
  const enterTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const playedTokenMoveKeysRef = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    return () => {
      if (enterTimerRef.current != null) {
        window.clearTimeout(enterTimerRef.current);
        enterTimerRef.current = null;
      }
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const setPresenceState = (nextState: MapPresenceState) => {
      mapPresenceStateRef.current = nextState;
      setMapPresenceState(nextState);
    };
    const clearEnterTimer = () => {
      if (enterTimerRef.current != null) {
        window.clearTimeout(enterTimerRef.current);
        enterTimerRef.current = null;
      }
    };
    const clearExitTimer = () => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };

    if (activeMap) {
      setRenderedMap(activeMap);
      clearExitTimer();
      const shouldPlayEntry = !isMapMountedRef.current
        || mapPresenceStateRef.current === 'hidden'
        || mapPresenceStateRef.current === 'exiting';
      if (!shouldPlayEntry) {
        if (mapPresenceStateRef.current !== 'entering') {
          clearEnterTimer();
          setPresenceState('visible');
        }
        return;
      }
      clearEnterTimer();
      isMapMountedRef.current = true;
      setPresenceState('entering');
      enterTimerRef.current = window.setTimeout(() => {
        enterTimerRef.current = null;
        if (mapPresenceStateRef.current === 'entering') {
          setPresenceState('visible');
        }
      }, TUANCHAT_MAP_ENTER_ANIMATION_MS);
      return;
    }

    clearEnterTimer();
    if (!isMapMountedRef.current) {
      setRenderedMap(null);
      setPresenceState('hidden');
      return;
    }
    // hide 指令会让 activeMap 变空；保留 renderedMap 的最后一帧，给 CSS 出场动画留时间。
    clearExitTimer();
    setPresenceState('exiting');
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      isMapMountedRef.current = false;
      setRenderedMap(null);
      setPresenceState('hidden');
    }, TUANCHAT_MAP_EXIT_ANIMATION_MS);
  }, [activeMap]);

  useEffect(() => {
    if (!renderedMap) {
      return;
    }
    const nextMoveKeys = collectNextPendingTokenMoveKeys(renderedMap, playedTokenMoveKeysRef.current);
    if (nextMoveKeys.length === 0) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      nextMoveKeys.forEach(moveKey => playedTokenMoveKeysRef.current.add(moveKey));
      setMovePlaybackTick(currentTick => currentTick + 1);
    }, TUANCHAT_TOKEN_MOVE_ANIMATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [renderedMap, movePlaybackTick]);

  if (!renderedMap) {
    return null;
  }

  return (
    <div className={joinClasses(styles.overlayRoot, getMapPresenceClass(mapPresenceState))}>
      <div className={styles.mapFrame}>
        {renderedMap.imageUrl ? <img className={styles.mapImage} src={renderedMap.imageUrl} alt="" /> : <div className={styles.emptyMap} />}
        <div className={styles.grid} style={buildGridStyle(renderedMap)} />
        {renderedMap.tokens.map((token) => {
          const tokenRenderState = buildTokenRenderState(token, playedTokenMoveKeysRef.current);
          const moveKey = tokenRenderState.moveKey;
          const renderedToken = tokenRenderState.token;
          const isTokenMoving = Boolean(moveKey);
          return (
            <div
              key={moveKey || token.roleId}
              className={joinClasses(styles.token, isTokenMoving && styles.tokenMoving)}
              style={buildTokenStyle(renderedToken, renderedMap)}
              title={renderedToken.name}
            >
              {renderedToken.avatarUrl
                ? <img className={styles.tokenImage} src={renderedToken.avatarUrl} alt="" />
                : <span className={styles.tokenLabel}>{renderedToken.name.replace(/^#/, '')}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
