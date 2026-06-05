import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { createNonePerform, IPerform } from '@/Core/Modules/perform/performInterface';
import { changeScene } from '../controller/scene/changeScene';
import { getStringArgByKey } from '../util/getSentenceArg';
import { getValueFromState } from './setVar';
import expression from 'angular-expressions';
import { logger } from '@/Core/util/logger';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readExpressionValue(key: string): unknown {
  const value = getValueFromState(key);
  return typeof value === 'string' ? JSON.stringify(value) : value;
}

function evaluateWhenExpression(rawExpression: string): boolean {
  const variableKeys = Array.from(rawExpression.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]+)*/g))
    .map(match => match[0])
    .sort((left, right) => right.length - left.length);
  const normalizedExpression = variableKeys.reduce((current, key) => {
    const value = readExpressionValue(key);
    if (value === undefined) {
      return current;
    }
    return current.replace(new RegExp(`\\b${escapeRegExp(key)}\\b`, 'g'), String(value));
  }, rawExpression);
  try {
    return Boolean(expression.compile(normalizedExpression)());
  } catch (error) {
    logger.error('changeScene when expression compile error', error);
    return false;
  }
}

/**
 * 切换场景。在场景结束后不会回到父场景。
 * @param sentence
 */
export const changeSceneScript = (sentence: ISentence): IPerform => {
  const whenExpression = getStringArgByKey(sentence, 'when')?.trim();
  if (whenExpression && !evaluateWhenExpression(whenExpression)) {
    return createNonePerform();
  }
  const sceneNameArray: Array<string> = sentence.content.split('/');
  const sceneName = sceneNameArray[sceneNameArray.length - 1];
  changeScene(sentence.content, sceneName);
  return createNonePerform({ isHoldOn: true });
};
