import type { ISentence } from '@/Core/controller/scene/sceneInterface';
import {
  FIGURE_POSITIONS,
  figureStateKeyByPosition,
  type IFigurePosition,
  type IStageState,
} from '@/Core/Modules/stage/stageInterface';
import { stageStateManager, type StageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { getFigurePositionFromArgs, getStringArgByKey } from '@/Core/util/getSentenceArg';

export interface IFigureTarget {
  key: string;
  position: IFigurePosition;
  isFree: boolean;
}

export interface IFigureTargetState extends IFigureTarget {
  source: string;
}

export function resolveFigureTarget(sentence: ISentence): IFigureTarget {
  const position = getFigurePositionFromArgs(sentence) || 'center';
  const explicitId = getStringArgByKey(sentence, 'id') ?? '';
  return {
    key: explicitId || `fig-${position}`,
    position,
    isFree: explicitId !== '',
  };
}

export function listFigureTargets(state: IStageState): IFigureTargetState[] {
  const targets = FIGURE_POSITIONS.map((position) => ({
    key: `fig-${position}`,
    position,
    isFree: false,
    source: state[figureStateKeyByPosition[position]] ?? '',
  }));
  targets.push(
    ...state.freeFigure.map((figure) => ({
      key: figure.key,
      position: figure.basePosition,
      isFree: true,
      source: figure.name,
    })),
  );
  return targets;
}

export function getFigureTargetSource(state: IStageState, target: IFigureTarget): string {
  if (target.isFree) {
    return state.freeFigure.find((figure) => figure.key === target.key)?.name ?? '';
  }
  return state[figureStateKeyByPosition[target.position]] ?? '';
}

export function setFigureTargetSource(
  target: IFigureTarget,
  source: string,
  manager: StageStateManager = stageStateManager,
): void {
  if (target.isFree) {
    manager.setFreeFigureByKey({ key: target.key, name: source, basePosition: target.position });
    return;
  }
  manager.setStage(figureStateKeyByPosition[target.position], source);
}
