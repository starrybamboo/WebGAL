import { expect, test } from 'vitest';
import { commandType, ISentence } from '@/Core/controller/scene/sceneInterface';
import { IStageCharacter } from '@/Core/Modules/stage/stageInterface';
import { character } from '@/Core/gameScripts/character';
import { CharacterFigureService } from './characterFigureService';
import { CharacterStageSync } from './characterStageSync';
import SceneParser, { ADD_NEXT_ARG_LIST, SCRIPT_CONFIG } from '../../../../parser/src';
import { initState, stageStateManager } from '@/Core/Modules/stage/stageStateManager';

test('a character sentence records logical state and later delivers one ordinary image without blocking', async () => {
  stageStateManager.resetCalculationStageState(initState);
  let finishComposition: (sourceUrl: string) => void = () => undefined;
  const compositionReady = new Promise<string>((resolve) => {
    finishComposition = resolve;
  });
  const loadedTemplateUrls: string[] = [];
  const deliveredFigures: Array<{ key: string; sourceUrl: string; position: string }> = [];
  const deliveredPresentations: Array<{ key: string; duration?: number; alpha?: number; zIndex?: number }> = [];
  const figureService = new CharacterFigureService({
    getTemplateUrl: (characterName) => `./game/figure/${characterName}/figure.json`,
    loadTemplate: async (templateUrl) => {
      loadedTemplateUrls.push(templateUrl);
      return {
        Version: 1,
        canvas: { width: 1600, height: 3000 },
        components: {
          body: { src: 'body.webp', x: 0, y: 0, scale: 1 },
        },
        presets: {},
      };
    },
    compose: async () => compositionReady,
  });
  const stageSync = new CharacterStageSync(figureService, {
    replaceFigure: (figure) => deliveredFigures.push(figure),
    removeFigure: () => undefined,
    getPresentationKey: (key) => JSON.stringify(
      stageStateManager.getCalculationStageState().animationSettings.find((setting) => setting.target === key),
    ),
    applyPresentation: (key) => {
      const state = stageStateManager.getCalculationStageState();
      deliveredPresentations.push({
        key,
        duration: state.animationSettings.find((setting) => setting.target === key)?.enterDuration,
        alpha: state.effects.find((effect) => effect.target === key)?.transform?.alpha,
        zIndex: state.figureMetaData[key]?.zIndex,
      });
    },
  });
  const parser = new SceneParser(
    () => undefined,
    (fileName) => fileName,
    ADD_NEXT_ARG_LIST,
    SCRIPT_CONFIG,
  );
  const parsedScene = parser.parse(
    'character: yuki/body -left -transform={"alpha":0.8} -duration=720 -ease=easeOut -zIndex=4;',
    'start',
    'start.txt',
  );
  const sentence = parsedScene.sentenceList[0] as unknown as ISentence;
  expect(sentence.command).toBe(commandType.character);

  const perform = character(sentence);
  const characters: IStageCharacter[] = stageStateManager.getCalculationStageState().characters;
  expect(perform.blockingNext()).toBe(false);
  expect(characters).toEqual([
    {
      name: 'yuki',
      key: 'character-yuki',
      items: ['body'],
      position: 'left',
    },
  ]);

  stageSync.sync(characters);
  expect(loadedTemplateUrls).toEqual(['./game/figure/yuki/figure.json']);
  expect(deliveredFigures).toEqual([]);

  finishComposition('data:image/png;base64,composed-character');
  await compositionReady;
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(deliveredFigures).toEqual([
    {
      key: 'character-yuki',
      sourceUrl: 'data:image/png;base64,composed-character',
      position: 'left',
    },
  ]);
  expect(deliveredPresentations).toEqual([{ key: 'character-yuki', duration: 720, alpha: 0.8, zIndex: 4 }]);
  expect(JSON.stringify(characters)).not.toContain('data:image');
  expect(JSON.stringify(characters)).not.toContain('figure.json');
});
