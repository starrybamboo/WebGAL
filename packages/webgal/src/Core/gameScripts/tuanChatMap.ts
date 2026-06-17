import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { createNonePerform, IPerform } from '@/Core/Modules/perform/performInterface';
import { createInitialTuanChatMapState, ITuanChatMapState, ITuanChatMapTokenState } from '@/Core/Modules/stage/stageInterface';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { assetSetter, fileType } from '@/Core/util/gameAssetsAccess/assetSetter';
import { getBooleanArgByKey, getNumberArgByKey, getStringArgByKey } from '@/Core/util/getSentenceArg';

type TuanChatMapAction = 'reset' | 'show' | 'hide' | 'config' | 'clear' | 'token';

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

function upsertToken(tokens: ITuanChatMapTokenState[], nextToken: ITuanChatMapTokenState): ITuanChatMapTokenState[] {
  const tokenIndex = tokens.findIndex(token => token.roleId === nextToken.roleId);
  if (tokenIndex < 0) {
    return [...tokens, nextToken].sort((left, right) => left.roleId - right.roleId);
  }
  const nextTokens = [...tokens];
  nextTokens[tokenIndex] = nextToken;
  return nextTokens.sort((left, right) => left.roleId - right.roleId);
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
  };
}

function applyToken(sentence: ISentence, state: ITuanChatMapState): ITuanChatMapState {
  const roleId = normalizePositiveInteger(getNumberArgByKey(sentence, 'roleId'), 0);
  if (roleId <= 0) {
    return state;
  }
  if (getBooleanArgByKey(sentence, 'remove') === true) {
    return {
      ...state,
      tokens: state.tokens.filter(token => token.roleId !== roleId),
    };
  }
  const rowIndex = normalizeNonNegativeInteger(getNumberArgByKey(sentence, 'row'));
  const colIndex = normalizeNonNegativeInteger(getNumberArgByKey(sentence, 'col'));
  if (rowIndex == null || colIndex == null) {
    return state;
  }
  const existing = state.tokens.find(token => token.roleId === roleId);
  const name = getStringArgByKey(sentence, 'name')?.trim() || existing?.name || '';
  const avatarUrl = resolveAssetUrl(getStringArgByKey(sentence, 'avatar'), fileType.figure) || existing?.avatarUrl || '';
  return {
    ...state,
    tokens: upsertToken(state.tokens, {
      roleId,
      rowIndex,
      colIndex,
      name,
      avatarUrl,
    }),
  };
}

/**
 * 团剧共创专用地图命令，避免用 setVar 表达资源路径与 token 生命周期。
 */
export const tuanChatMap = (sentence: ISentence): IPerform => {
  const action = normalizeAction(sentence.content);
  if (!action) {
    return createNonePerform();
  }
  const current = getCurrentMapState();
  if (action === 'reset') {
    setMapState(createInitialTuanChatMapState());
    return createNonePerform();
  }
  if (action === 'show') {
    setMapState({ ...current, visible: true });
    return createNonePerform();
  }
  if (action === 'hide') {
    setMapState({ ...current, visible: false });
    return createNonePerform();
  }
  if (action === 'clear') {
    const initialState = createInitialTuanChatMapState();
    setMapState({
      ...initialState,
      visible: current.visible,
    });
    return createNonePerform();
  }
  if (action === 'config') {
    setMapState(applyConfig(sentence, current));
    return createNonePerform();
  }
  setMapState(applyToken(sentence, current));
  return createNonePerform();
};
