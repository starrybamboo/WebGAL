import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  buildCharacterTransformTimeline,
  CharacterDeferredPresentationController,
  ICharacterDeferredPresentationRuntime,
} from './characterDeferredPresentation';

let runtime: ICharacterDeferredPresentationRuntime;
let controller: CharacterDeferredPresentationController;

beforeEach(() => {
  vi.useFakeTimers();
  runtime = {
    isSkipAnimation: vi.fn(() => false),
    buildNamedAnimation: vi.fn(() => null),
    buildTransformAnimation: vi.fn(() => ({ animation: {}, duration: 250 })),
    registerAnimation: vi.fn(),
    removeAnimation: vi.fn(),
  };
  controller = new CharacterDeferredPresentationController(runtime);
});

afterEach(() => {
  vi.useRealTimers();
});

test('a transform presentation registers a finite animation and releases its Pixi lock at the end', () => {
  controller.play('character-yuki', {
    target: 'character-yuki',
    enterDuration: 250,
    baseTransform: { alpha: 0 },
    enterTransform: { alpha: 0.8 },
  });

  expect(runtime.registerAnimation).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(250);
  expect(runtime.removeAnimation).toHaveBeenLastCalledWith('character-yuki-deferred-enter');
});

test('clearing a presentation removes its animation immediately and cancels delayed cleanup', () => {
  controller.play('character-yuki', {
    target: 'character-yuki',
    enterDuration: 250,
    enterTransform: { alpha: 1 },
  });

  controller.clear('character-yuki');
  vi.advanceTimersByTime(250);

  expect(runtime.removeAnimation).toHaveBeenCalledTimes(2);
});

test('a transform timeline keeps distinct previous and terminal states', () => {
  expect(
    buildCharacterTransformTimeline({
      target: 'character-yuki',
      enterDuration: 300,
      enterEase: 'easeInOut',
      baseTransform: { alpha: 0.8, position: { x: 12 } },
      enterTransform: { alpha: 0.6, position: { x: 24 } },
    }),
  ).toEqual([
    { alpha: 0.8, position: { x: 12 }, scale: undefined, duration: 0, ease: 'easeInOut' },
    { alpha: 0.6, position: { x: 24 }, scale: undefined, duration: 300, ease: 'easeInOut' },
  ]);
});
