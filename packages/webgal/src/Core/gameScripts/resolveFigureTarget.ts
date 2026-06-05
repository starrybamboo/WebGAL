import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { getBooleanArgByKey, getStringArgByKey } from '@/Core/util/getSentenceArg';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';

export type FigureTargetPosition = '' | 'center' | 'left' | 'right';

export interface IResolvedFigureTarget {
  key: string;
  pos: FigureTargetPosition;
}

/**
 * 统一解析对话/语音脚本里的发言目标，避免 say 与 vocal 使用不同规则。
 */
export function resolveFigureTarget(sentence: ISentence): IResolvedFigureTarget {
  let pos: FigureTargetPosition = '';
  const leftFromArgs = getBooleanArgByKey(sentence, 'left') ?? false;
  const rightFromArgs = getBooleanArgByKey(sentence, 'right') ?? false;
  const centerFromArgs = getBooleanArgByKey(sentence, 'center') ?? false;

  if (leftFromArgs) pos = 'left';
  if (rightFromArgs) pos = 'right';
  if (centerFromArgs) pos = 'center';

  const rawKey = getStringArgByKey(sentence, 'figureId') ?? '';
  if (!rawKey) {
    return {
      key: pos ? `fig-${pos}` : '',
      pos,
    };
  }

  const foundFreeFigure = stageStateManager.getCalculationStageState().freeFigure.find((figure) => figure.key === rawKey);
  if (foundFreeFigure) {
    pos = foundFreeFigure.basePosition;
  } else {
    const presetPosition = getPresetPositionFromKey(rawKey);
    if (presetPosition) {
      pos = presetPosition;
    }
  }

  return {
    key: rawKey,
    pos,
  };
}

export function resolveFigurePositionByKey(key: string): FigureTargetPosition {
  if (!key) {
    return '';
  }

  const foundFreeFigure = stageStateManager.getCalculationStageState().freeFigure.find((figure) => figure.key === key);
  if (foundFreeFigure) {
    return foundFreeFigure.basePosition;
  }

  return getPresetPositionFromKey(key);
}

function getPresetPositionFromKey(key: string): FigureTargetPosition {
  switch (key) {
    case 'fig-left':
      return 'left';
    case 'fig-center':
      return 'center';
    case 'fig-right':
      return 'right';
    default:
      return '';
  }
}
