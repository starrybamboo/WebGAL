import { commandType, type ISentence } from '@/Core/controller/scene/sceneInterface';
import { createNonePerform, type IPerform } from '@/Core/Modules/perform/performInterface';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { CharacterTemplateError, parseCharacterSelector } from '@/Core/character/characterTemplate';
import { parseCharacterFigureSource, serializeCharacterFigureSource } from '@/Core/character/characterFigureSource';
import {
  listFigureTargets,
  resolveFigureTarget,
  type IFigureTargetState,
} from '@/Core/character/characterFigureTarget';
import { getBooleanArgByKey } from '@/Core/util/getSentenceArg';
import { logger } from '@/Core/util/logger';
import { WEBGAL_NONE } from '@/Core/constants';
import { changeFigure } from './changeFigure';

const CHARACTER_UNSUPPORTED_FIGURE_ARGS = new Set([
  'motion',
  'skin',
  'expression',
  'bounds',
  'blink',
  'focus',
  'mouthOpen',
  'mouthClose',
  'mouthHalfOpen',
  'eyesOpen',
  'eyesClose',
  'animationFlag',
]);

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
      // Character 只提供一个可持久化的静态图片来源；Figure 状态、transform、animation 与退场
      // 全部委托给上游 changeFigure。真正图片异步就绪后由 Character source adapter 交付给 Pixi。
      changeFigure(toStaticFigureSentence(sentence, source));
      return createNonePerform();
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
      changeFigure(toClearFigureSentence(target));
    }
  }
}

function toStaticFigureSentence(sentence: ISentence, source: string): ISentence {
  return {
    ...sentence,
    command: commandType.changeFigure,
    commandRaw: 'changeFigure',
    content: source,
    args: sentence.args.filter((arg) => !CHARACTER_UNSUPPORTED_FIGURE_ARGS.has(arg.key)),
  };
}

function toClearFigureSentence(target: IFigureTargetState): ISentence {
  const args: ISentence['args'] = [{ key: target.position, value: true }];
  if (target.isFree) {
    args.push({ key: 'id', value: target.key });
  }
  return {
    command: commandType.changeFigure,
    commandRaw: 'changeFigure',
    content: WEBGAL_NONE,
    args,
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    isLineBreakHolder: false,
  };
}
