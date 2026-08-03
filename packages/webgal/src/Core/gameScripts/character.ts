import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { createNonePerform, IPerform } from '@/Core/Modules/perform/performInterface';
import { baseTransform, IStageCharacter, ITransform } from '@/Core/Modules/stage/stageInterface';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import {
  getBooleanArgByKey,
  getFigurePositionFromArgs,
  getNumberArgByKey,
  getStringArgByKey,
} from '@/Core/util/getSentenceArg';
import { logger } from '@/Core/util/logger';
import { CharacterTemplateError, parseCharacterSelector } from '@/Core/character/characterTemplate';
import { parseTransformFrame } from './parseTransformFrame';
import cloneDeep from 'lodash/cloneDeep';
import { applyAnimationEndState } from '@/Core/Modules/animationFunctions';

interface ICharacterPresentationContext {
  sourceChanged: boolean;
}

export interface ICharacterCommandDependencies {
  getCharacters: () => IStageCharacter[];
  setCharacters: (characters: IStageCharacter[]) => void;
  logAuthorError: (message: string) => void;
  prepareSourceChange?: (target: string) => void;
  applyPresentation?: (sentence: ISentence, character: IStageCharacter, context: ICharacterPresentationContext) => void;
}

export function createDefaultCharacterCommandDependencies(): ICharacterCommandDependencies {
  return {
    getCharacters: () => stageStateManager.getCalculationStageState().characters,
    setCharacters: (characters) => stageStateManager.setStage('characters', characters),
    logAuthorError: (message) => logger.error(message),
    prepareSourceChange: (target) => stageStateManager.removeAnimationSettingsByTarget(target),
    applyPresentation: applyCharacterPresentationState,
  };
}

export function createCharacterCommand(
  dependencies: ICharacterCommandDependencies = createDefaultCharacterCommandDependencies(),
) {
  return (sentence: ISentence): IPerform => {
    try {
      const selector = parseCharacterSelector(sentence.content);
      const currentCharacters = dependencies.getCharacters();
      const existingIndex = currentCharacters.findIndex((character) => character.name === selector.characterName);
      const existing = existingIndex >= 0 ? currentCharacters[existingIndex] : undefined;
      const items = selector.items.length > 0 ? selector.items : existing?.items;
      if (!items) {
        dependencies.logAuthorError(`角色 ${selector.characterName} 首次出现时必须提供组合列表`);
        return createNonePerform();
      }

      const character: IStageCharacter = {
        name: selector.characterName,
        key: getCharacterFigureKey(selector.characterName),
        items: [...items],
        position: getFigurePositionFromArgs(sentence) || existing?.position || 'center',
      };
      const sourceChanged = !existing || hasCharacterSourceChanged(existing, character);
      if (existing && sourceChanged) {
        dependencies.prepareSourceChange?.(existing.key);
      }
      const nextCharacters = [...currentCharacters];
      if (existingIndex >= 0) {
        nextCharacters.splice(existingIndex, 1, character);
      } else {
        nextCharacters.push(character);
      }
      dependencies.setCharacters(nextCharacters);
      dependencies.applyPresentation?.(sentence, character, { sourceChanged });
    } catch (error) {
      const message = error instanceof CharacterTemplateError ? error.message : String(error);
      dependencies.logAuthorError(`character 命令无效：${message}`);
    }
    return createNonePerform();
  };
}

export function getCharacterFigureKey(characterName: string): string {
  return `character-${encodeURIComponent(characterName)}`;
}

export const character = createCharacterCommand();

function hasCharacterSourceChanged(previous: IStageCharacter, next: IStageCharacter): boolean {
  return previous.position !== next.position || JSON.stringify(previous.items) !== JSON.stringify(next.items);
}

function applyCharacterPresentationState(
  sentence: ISentence,
  character: IStageCharacter,
  context: ICharacterPresentationContext,
) {
  const target = character.key;
  const ignoreDefault = getBooleanArgByKey(sentence, 'ignoreDefault') ?? false;
  const enterAnimation = getStringArgByKey(sentence, 'enter');
  const exitAnimation = getStringArgByKey(sentence, 'exit');
  const transformSource = getStringArgByKey(sentence, 'transform');
  if (transformSource) {
    const frame = parseTransformFrame(transformSource);
    if (frame) {
      const { duration: _frameDuration, ease: _frameEase, ...transform } = frame;
      const enterTransform = transform as ITransform;
      const previousTransform = cloneDeep(
        stageStateManager.getCalculationStageState().effects.find((effect) => effect.target === target)?.transform,
      );
      stageStateManager.updateEffect({ target, transform: enterTransform });
      const finalTransform = cloneDeep(
        stageStateManager.getCalculationStageState().effects.find((effect) => effect.target === target)?.transform ??
          enterTransform,
      );
      const animationStart = context.sourceChanged
        ? { ...cloneDeep(finalTransform), alpha: 0 }
        : previousTransform ?? { ...cloneDeep(finalTransform), alpha: 0 };
      stageStateManager.updateAnimationSettings({ target, key: 'baseTransform', value: animationStart });
      stageStateManager.updateAnimationSettings({ target, key: 'enterTransform', value: finalTransform });
      // 显式 transform 应替代旧的命名入场，否则同图更新会错误重放旧动画。
      stageStateManager.updateAnimationSettings({ target, key: 'enterAnimationName', value: undefined });
    } else {
      logger.error(`角色 ${character.name} 的 transform 参数不是有效 JSON 对象`);
    }
  } else if (context.sourceChanged && !enterAnimation) {
    const finalTransform = cloneDeep(
      stageStateManager.getCalculationStageState().effects.find((effect) => effect.target === target)?.transform ??
        baseTransform,
    );
    stageStateManager.updateAnimationSettings({
      target,
      key: 'baseTransform',
      value: { ...cloneDeep(finalTransform), alpha: 0 },
    });
    stageStateManager.updateAnimationSettings({ target, key: 'enterTransform', value: finalTransform });
  }

  const ease = getStringArgByKey(sentence, 'ease');
  if (ease) {
    stageStateManager.updateAnimationSettings({ target, key: 'enterEase', value: ease });
  }
  const duration = getNumberArgByKey(sentence, 'duration');
  const enterDuration = getNumberArgByKey(sentence, 'enterDuration') ?? duration;
  const exitDuration = getNumberArgByKey(sentence, 'exitDuration');
  if (enterDuration !== null) {
    stageStateManager.updateAnimationSettings({ target, key: 'enterDuration', value: enterDuration });
  }
  if (exitDuration !== null) {
    stageStateManager.updateAnimationSettings({ target, key: 'exitDuration', value: exitDuration });
  }

  if (enterAnimation) {
    stageStateManager.updateAnimationSettings({ target, key: 'enterAnimationName', value: enterAnimation });
    stageStateManager.updateAnimationSettings({ target, key: 'enterAnimationIgnoreDefault', value: ignoreDefault });
    // 与 changeFigure 一样在演算期写入命名动画终态，异步出图和存档都只观察稳定状态。
    applyAnimationEndState(enterAnimation, target, false, !ignoreDefault);
  }
  if (exitAnimation) {
    stageStateManager.updateAnimationSettings({ target, key: 'exitAnimationName', value: exitAnimation });
    stageStateManager.updateAnimationSettings({ target, key: 'exitAnimationIgnoreDefault', value: ignoreDefault });
  }

  const zIndex = getNumberArgByKey(sentence, 'zIndex');
  if (zIndex !== null) {
    stageStateManager.setFigureMetaData([target, 'zIndex', zIndex, false]);
  }
  const blendMode = getStringArgByKey(sentence, 'blendMode');
  if (blendMode) {
    stageStateManager.setFigureMetaData([target, 'blendMode', blendMode, false]);
  }
}
