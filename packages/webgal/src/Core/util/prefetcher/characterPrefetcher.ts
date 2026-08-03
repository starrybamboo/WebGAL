import { commandType, IScene } from '@/Core/controller/scene/sceneInterface';
import {
  CharacterFigureService,
  characterFigureService,
  ICharacterFigureRequest,
} from '@/Core/character/characterFigureService';
import { CharacterTemplateError, parseCharacterSelector } from '@/Core/character/characterTemplate';

type CharacterPrewarmer = Pick<CharacterFigureService, 'prewarm'>;

export function prefetchCharactersByProgress(
  scene: IScene,
  startLine: number,
  lookahead: number,
  prewarmer: CharacterPrewarmer = characterFigureService,
): void {
  const scheduled = new Set<string>();
  for (const sentence of scene.sentenceList.slice(startLine, startLine + lookahead + 1)) {
    if (sentence.command !== commandType.character) {
      continue;
    }
    try {
      const selector = parseCharacterSelector(sentence.content);
      if (selector.items.length === 0) {
        // 省略组合项依赖运行到该句时的角色状态，静态预热无法可靠推导。
        continue;
      }
      const request: ICharacterFigureRequest = {
        name: selector.characterName,
        items: selector.items,
      };
      const key = JSON.stringify([request.name, request.items]);
      if (!scheduled.has(key)) {
        scheduled.add(key);
        prewarmer.prewarm(request);
      }
    } catch (error) {
      if (!(error instanceof CharacterTemplateError)) {
        throw error;
      }
      // 无效作者语句由真正执行 character 命令时统一报告。
    }
  }
}
