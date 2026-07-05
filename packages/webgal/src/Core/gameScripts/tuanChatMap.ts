import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { IPerform } from '@/Core/Modules/perform/performInterface';
import { createInitialTuanChatMapState, ITuanChatMapState, ITuanChatMapTokenState } from '@/Core/Modules/stage/stageInterface';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { assetSetter, fileType } from '@/Core/util/gameAssetsAccess/assetSetter';
import { getBooleanArgByKey, getNumberArgByKey, getStringArgByKey } from '@/Core/util/getSentenceArg';
import {
  TUANCHAT_MAP_ENTER_ANIMATION_MS,
  TUANCHAT_MAP_EXIT_ANIMATION_MS,
  TUANCHAT_TOKEN_MOVE_ANIMATION_MS,
} from './tuanChatMapTimings';

type TuanChatMapAction = 'reset' | 'show' | 'hide' | 'config' | 'clear' | 'token';
const MAX_TOKEN_MOVE_SEGMENTS = 32;

function normalizeAction(value: string): TuanChatMapAction | null {
  const action = value.trim();
  if (
    action === 'reset'
    || action === 'show'
    || action === 'hide'
    || action === 'config'
    || action === 'clear'
    || action === 'token'
  ) {
    return action;
  }
  return null;
}

function normalizePositiveInteger(value: number | null, fallback: number): number {
  return value != null && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function normalizeNonNegativeInteger(value: number | null): number | null {
  return value != null && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function normalizeGridColor(value: string | null, fallback: string): string {
  const color = value?.trim() ?? '';
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback;
}

function isAlreadyResolvedAssetPath(value: string): boolean {
  return /^(https?:|data:|blob:|\.\/game\/|\/games\/|game\/)/.test(value);
}

function normalizeResolvedAssetPath(value: string): string {
  return value.startsWith('game/') ? `./${value}` : value;
}

function resolveAssetUrl(rawValue: string | null, type: fileType): string {
  const value = rawValue?.trim() ?? '';
  if (!value) {
    return '';
  }
  if (isAlreadyResolvedAssetPath(value)) {
    return normalizeResolvedAssetPath(value);
  }
  return assetSetter(value, type);
}

function updateRevision(state: ITuanChatMapState): ITuanChatMapState {
  return {
    ...state,
    revision: state.revision + 1,
  };
}

function getCurrentMapState(): ITuanChatMapState {
  return stageStateManager.getCalculationStageState().tuanChatMap ?? createInitialTuanChatMapState();
}

function setMapState(nextState: ITuanChatMapState): void {
  stageStateManager.setStage('tuanChatMap', updateRevision(nextState));
}

function createMapAutoPerform(duration: number): IPerform {
  return {
    performName: `tuanChatMap-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    duration,
    goNextWhenOver: true,
    isHoldOn: false,
    stopFunction: () => {},
    blockingNext: () => true,
    blockingAuto: () => true,
  };
}

function hasRenderableMap(state: ITuanChatMapState): boolean {
  return state.configActive || state.imageUrl !== '' || state.tokens.length > 0;
}

function upsertToken(tokens: ITuanChatMapTokenState[], nextToken: ITuanChatMapTokenState): { tokens: ITuanChatMapTokenState[]; hasMoved: boolean } {
  const tokenIndex = tokens.findIndex(token => token.roleId === nextToken.roleId);
  if (tokenIndex < 0) {
    return {
      tokens: [...tokens, { ...nextToken, moveRevision: 0, moveSegments: [] }].sort((left, right) => left.roleId - right.roleId),
      hasMoved: false,
    };
  }
  const existingToken = tokens[tokenIndex];
  const hasMoved = existingToken.rowIndex !== nextToken.rowIndex || existingToken.colIndex !== nextToken.colIndex;
  const moveRevision = hasMoved ? (existingToken.moveRevision ?? 0) + 1 : (existingToken.moveRevision ?? 0);
  const moveSegments = hasMoved
    ? [
        ...(existingToken.moveSegments ?? []),
        {
          fromRowIndex: existingToken.rowIndex,
          fromColIndex: existingToken.colIndex,
          toRowIndex: nextToken.rowIndex,
          toColIndex: nextToken.colIndex,
          revision: moveRevision,
        },
      ].slice(-MAX_TOKEN_MOVE_SEGMENTS)
    : existingToken.moveSegments;
  const nextTokens = [...tokens];
  nextTokens[tokenIndex] = {
    ...nextToken,
    previousRowIndex: hasMoved ? existingToken.rowIndex : undefined,
    previousColIndex: hasMoved ? existingToken.colIndex : undefined,
    moveRevision,
    moveSegments,
  };
  return {
    tokens: nextTokens.sort((left, right) => left.roleId - right.roleId),
    hasMoved,
  };
}

function applyConfig(sentence: ISentence, state: ITuanChatMapState): ITuanChatMapState {
  const gridRows = normalizePositiveInteger(getNumberArgByKey(sentence, 'rows'), state.gridRows);
  const gridCols = normalizePositiveInteger(getNumberArgByKey(sentence, 'cols'), state.gridCols);
  const tokens = getBooleanArgByKey(sentence, 'clearTokens') === true
    ? []
    : state.tokens.filter(token => token.rowIndex < gridRows && token.colIndex < gridCols);
  return {
    ...state,
    configActive: true,
    imageUrl: resolveAssetUrl(getStringArgByKey(sentence, 'background'), fileType.background),
    gridRows,
    gridCols,
    gridColor: normalizeGridColor(getStringArgByKey(sentence, 'gridColor'), state.gridColor),
    tokens,
    pendingMoveOnShow: false,
  };
}

function applyToken(sentence: ISentence, state: ITuanChatMapState): { state: ITuanChatMapState; hasMoved: boolean } {
  const roleId = normalizePositiveInteger(getNumberArgByKey(sentence, 'roleId'), 0);
  if (roleId <= 0) {
    return { state, hasMoved: false };
  }
  if (getBooleanArgByKey(sentence, 'remove') === true) {
    return {
      state: {
        ...state,
        tokens: state.tokens.filter(token => token.roleId !== roleId),
      },
      hasMoved: false,
    };
  }
  const rowIndex = normalizeNonNegativeInteger(getNumberArgByKey(sentence, 'row'));
  const colIndex = normalizeNonNegativeInteger(getNumberArgByKey(sentence, 'col'));
  if (rowIndex == null || colIndex == null) {
    return { state, hasMoved: false };
  }
  const existing = state.tokens.find(token => token.roleId === roleId);
  const name = getStringArgByKey(sentence, 'name')?.trim() || existing?.name || '';
  const avatarUrl = resolveAssetUrl(getStringArgByKey(sentence, 'avatar'), fileType.figure) || existing?.avatarUrl || '';
  const upsertResult = upsertToken(state.tokens, {
    roleId,
    rowIndex,
    colIndex,
    name,
    avatarUrl,
  });
  return {
    state: {
      ...state,
      tokens: upsertResult.tokens,
      pendingMoveOnShow: state.pendingMoveOnShow || (upsertResult.hasMoved && !state.visible),
    },
    hasMoved: upsertResult.hasMoved,
  };
}

/**
 * 团剧共创专用地图命令，避免用 setVar 表达资源路径与 token 生命周期。
 */
export const tuanChatMap = (sentence: ISentence): IPerform => {
  const action = normalizeAction(sentence.content);
  if (!action) {
    return createMapAutoPerform(0);
  }
  const current = getCurrentMapState();
  if (action === 'reset') {
    setMapState(createInitialTuanChatMapState());
    return createMapAutoPerform(hasRenderableMap(current) ? TUANCHAT_MAP_EXIT_ANIMATION_MS : 0);
  }
  if (action === 'show') {
    const shouldEnter = !current.visible && hasRenderableMap(current);
    const shouldWaitForMove = current.pendingMoveOnShow;
    setMapState({ ...current, visible: true, pendingMoveOnShow: false });
    return createMapAutoPerform(Math.max(
      shouldEnter ? TUANCHAT_MAP_ENTER_ANIMATION_MS : 0,
      shouldWaitForMove ? TUANCHAT_TOKEN_MOVE_ANIMATION_MS : 0,
    ));
  }
  if (action === 'hide') {
    setMapState({ ...current, visible: false });
    return createMapAutoPerform(current.visible && hasRenderableMap(current) ? TUANCHAT_MAP_EXIT_ANIMATION_MS : 0);
  }
  if (action === 'clear') {
    const initialState = createInitialTuanChatMapState();
    setMapState({
      ...initialState,
      visible: current.visible,
    });
    return createMapAutoPerform(0);
  }
  if (action === 'config') {
    setMapState(applyConfig(sentence, current));
    return createMapAutoPerform(0);
  }
  const tokenResult = applyToken(sentence, current);
  setMapState(tokenResult.state);
  return createMapAutoPerform(tokenResult.hasMoved && current.visible ? TUANCHAT_TOKEN_MOVE_ANIMATION_MS : 0);
};
