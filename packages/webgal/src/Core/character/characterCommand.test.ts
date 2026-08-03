import { expect, test } from 'vitest';
import { commandType, ISentence } from '@/Core/controller/scene/sceneInterface';
import { IStageCharacter } from '@/Core/Modules/stage/stageInterface';
import { character, createCharacterCommand } from '@/Core/gameScripts/character';
import { initState, stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { WebGAL } from '@/Core/WebGAL';

function sentence(content: string, args: ISentence['args'] = []): ISentence {
  return {
    command: commandType.character,
    commandRaw: 'character',
    content,
    args,
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    isLineBreakHolder: false,
  };
}

test('same-name commands update one stable character while different names coexist', () => {
  let characters: IStageCharacter[] = [];
  const command = createCharacterCommand({
    getCharacters: () => characters,
    setCharacters: (nextCharacters) => {
      characters = nextCharacters;
    },
    logAuthorError: (message) => {
      throw new Error(message);
    },
  });

  command(sentence('yuki/body', [{ key: 'left', value: true }]));
  command(sentence('yuki/face', [{ key: 'right', value: true }]));
  command(sentence('mika/body', [{ key: 'left', value: true }]));

  expect(characters).toEqual([
    { name: 'yuki', key: 'character-yuki', items: ['face'], position: 'right' },
    { name: 'mika', key: 'character-mika', items: ['body'], position: 'left' },
  ]);
});

test('omitting a selection preserves the current composition and only moves the existing character', () => {
  let characters: IStageCharacter[] = [];
  const command = createCharacterCommand({
    getCharacters: () => characters,
    setCharacters: (nextCharacters) => {
      characters = nextCharacters;
    },
    logAuthorError: (message) => {
      throw new Error(message);
    },
  });

  command(sentence('yuki/body,face', [{ key: 'left', value: true }]));
  command(sentence('yuki', [{ key: 'right', value: true }]));

  expect(characters).toEqual([{ name: 'yuki', key: 'character-yuki', items: ['body', 'face'], position: 'right' }]);
});

test('a first character command without a selection reports an author error and creates nothing', () => {
  let characters: IStageCharacter[] = [];
  const errors: string[] = [];
  const command = createCharacterCommand({
    getCharacters: () => characters,
    setCharacters: (nextCharacters) => {
      characters = nextCharacters;
    },
    logAuthorError: (message) => errors.push(message),
  });

  command(sentence('yuki'));

  expect(characters).toEqual([]);
  expect(errors).toEqual(['角色 yuki 首次出现时必须提供组合列表']);
});

test('character records applicable figure presentation parameters on its stable target', () => {
  stageStateManager.resetCalculationStageState(initState);

  character(
    sentence('yuki/body', [
      { key: 'left', value: true },
      { key: 'transform', value: '{"alpha":0.8,"position":{"x":12}}' },
      { key: 'ease', value: 'easeInOut' },
      { key: 'duration', value: 800 },
      { key: 'enterDuration', value: 900 },
      { key: 'exitDuration', value: 700 },
      { key: 'enter', value: 'fadeIn' },
      { key: 'exit', value: 'fadeOut' },
      { key: 'zIndex', value: 4 },
      { key: 'blendMode', value: 'multiply' },
    ]),
  );

  const state = stageStateManager.getCalculationStageState();
  expect(state.effects.find((effect) => effect.target === 'character-yuki')?.transform).toMatchObject({
    alpha: 0.8,
    position: { x: 12 },
  });
  expect(state.animationSettings.find((setting) => setting.target === 'character-yuki')).toMatchObject({
    enterAnimationName: 'fadeIn',
    exitAnimationName: 'fadeOut',
    enterDuration: 900,
    exitDuration: 700,
    enterEase: 'easeInOut',
    enterTransform: { alpha: 0.8, position: { x: 12 } },
    baseTransform: { alpha: 0 },
  });
  expect(state.figureMetaData['character-yuki']).toEqual({ zIndex: 4, blendMode: 'multiply' });
});

test('a new character gets the ordinary figure fade when only duration and ease are provided', () => {
  stageStateManager.resetCalculationStageState(initState);

  character(
    sentence('yuki/body', [
      { key: 'duration', value: 640 },
      { key: 'ease', value: 'easeOut' },
    ]),
  );

  expect(stageStateManager.getCalculationStageState().animationSettings).toContainEqual(
    expect.objectContaining({
      target: 'character-yuki',
      enterDuration: 640,
      enterEase: 'easeOut',
      baseTransform: expect.objectContaining({ alpha: 0 }),
      enterTransform: expect.objectContaining({ alpha: 1 }),
    }),
  );
});

test('a named entrance writes its terminal effect before the composed image is ready', () => {
  stageStateManager.resetCalculationStageState(initState);
  const animationName = 'character-test-named-enter';
  WebGAL.animationManager.addAnimation({
    name: animationName,
    effects: [
      { alpha: 0, duration: 0, ease: '' },
      { alpha: 0.7, position: { x: 48, y: 0 }, duration: 300, ease: 'easeOut' },
    ],
  });

  character(sentence('yuki/body', [{ key: 'enter', value: animationName }]));

  expect(stageStateManager.getCalculationStageState().effects).toContainEqual(
    expect.objectContaining({
      target: 'character-yuki',
      transform: expect.objectContaining({ alpha: 0.7, position: { x: 48, y: 0 } }),
    }),
  );
});

test('a transform-only update animates from the previous state instead of replaying a stale named entrance', () => {
  stageStateManager.resetCalculationStageState(initState);
  character(
    sentence('yuki/body', [
      { key: 'transform', value: '{"alpha":0.8,"position":{"x":12}}' },
      { key: 'enter', value: 'fadeIn' },
    ]),
  );

  character(
    sentence('yuki', [
      { key: 'transform', value: '{"alpha":0.6,"position":{"x":24}}' },
      { key: 'duration', value: 300 },
    ]),
  );

  expect(stageStateManager.getCalculationStageState().animationSettings).toContainEqual(
    expect.objectContaining({
      target: 'character-yuki',
      enterAnimationName: undefined,
      enterDuration: 300,
      baseTransform: expect.objectContaining({ alpha: 0.8, position: { x: 12 } }),
      enterTransform: expect.objectContaining({ alpha: 0.6, position: { x: 24 } }),
    }),
  );
});
