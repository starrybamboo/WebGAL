import { expect, test, vi } from 'vitest';
import { commandType, IScene, ISentence } from '@/Core/controller/scene/sceneInterface';
import { prefetchCharactersByProgress } from './characterPrefetcher';

function sentence(command: commandType, content: string): ISentence {
  return {
    command,
    commandRaw: commandType[command],
    content,
    args: [],
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    isLineBreakHolder: false,
  };
}

test('progress prefetch schedules unique explicit character selections inside the lookahead window', () => {
  const scene: IScene = {
    sceneName: 'start',
    sceneUrl: 'start.txt',
    sentenceList: [
      sentence(commandType.say, 'before'),
      sentence(commandType.character, 'yuki/body,face'),
      sentence(commandType.character, 'yuki/body,face'),
      sentence(commandType.character, 'yuki/dress'),
      sentence(commandType.character, 'yuki'),
      sentence(commandType.character, 'outside/window'),
    ],
    assetsList: [],
    subSceneList: [],
  };
  const prewarm = vi.fn();

  prefetchCharactersByProgress(scene, 1, 3, { prewarm });

  expect(prewarm.mock.calls.map(([request]) => request)).toEqual([
    { name: 'yuki', items: ['body', 'face'] },
    { name: 'yuki', items: ['dress'] },
  ]);
});
