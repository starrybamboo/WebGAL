import type { ISentence } from '@/Core/controller/scene/sceneInterface';
import { createNonePerform, type IPerform } from '@/Core/Modules/perform/performInterface';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { CharacterTemplateError, parseCharacterSelector } from '@/Core/character/characterTemplate';
import {
  parseCharacterFigureSource,
  serializeCharacterFigureSource,
} from '@/Core/character/characterFigureSource';
import { listFigureTargets, resolveFigureTarget } from '@/Core/figure/figureTarget';
import { clearFigureTarget, presentFigureTarget } from '@/Core/figure/figureTargetPresentation';
import { getBooleanArgByKey } from '@/Core/util/getSentenceArg';
import { logger } from '@/Core/util/logger';
import { WEBGAL_NONE } from '@/Core/constants';

export interface ICharacterCommandDependencies {
  logAuthorError: (message: string) => void;
}

export function createDefaultCharacterCommandDependencies(): ICharacterCommandDependencies {
  return {
    logAuthorError: (message) => logger.error(message),
  };
}

export function createCharacterCommand(
  dependencies: ICharacterCommandDependencies = createDefaultCharacterCommandDependencies(),
) {
  return (sentence: ISentence): IPerform => {
    try {
      const content = sentence.content.trim();
      if (content === WEBGAL_NONE) {
        clearCharacterFigureTargets();
        return createNonePerform();
      }

      const selector = parseCharacterSelector(content);
      if (getBooleanArgByKey(sentence, 'clear')) {
        clearCharacterFigureTargets(selector.characterName);
        return createNonePerform();
      }
      if (selector.items.length === 0) {
        throw new CharacterTemplateError(`角色 ${selector.characterName} 的组合列表不能为空`);
      }

      const target = resolveFigureTarget(sentence);
      clearCharacterFigureTargets(selector.characterName, target.key);
      const source = serializeCharacterFigureSource({ name: selector.characterName, items: selector.items });
      return presentFigureTarget(sentence, { source, staticOnly: true, deferUntilSourceReady: true });
    } catch (error) {
      const message = error instanceof CharacterTemplateError ? error.message : String(error);
      dependencies.logAuthorError(`character 命令无效：${message}`);
      return createNonePerform();
    }
  };
}

export const character = createCharacterCommand();

function clearCharacterFigureTargets(characterName?: string, exceptTargetKey?: string): void {
  const targets = listFigureTargets(stageStateManager.getCalculationStageState());
  for (const target of targets) {
    if (!target.source || target.key === exceptTargetKey) {
      continue;
    }
    const source = parseCharacterFigureSource(target.source);
    if (source && (characterName === undefined || source.name === characterName)) {
      clearFigureTarget(target);
    }
  }
}
