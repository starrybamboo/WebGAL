import type { ISentence } from '@/Core/controller/scene/sceneInterface';
import type { IPerform } from '@/Core/Modules/perform/performInterface';
import { presentFigureTarget } from '@/Core/figure/figureTargetPresentation';

/** 更改普通图片、Live2D 或 Spine Figure。 */
export function changeFigure(sentence: ISentence): IPerform {
  return presentFigureTarget(sentence);
}
