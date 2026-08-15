import { expect, test, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { WebGALPixiContainer } from '@/Core/controller/stage/pixi/WebGALPixiContainer';
import { generateTimelineObj, type ITimelineRuntime } from './timeline';

test('timeline updates the current target container after the original container is replaced', () => {
  let onUpdate: ((value: Record<string, number>) => void) | undefined;
  const runtime: ITimelineRuntime = {
    getTargetContainer: () => currentStageObject.pixiContainer,
    animate: (options) => {
      const testOptions = options as { onUpdate: typeof onUpdate };
      onUpdate = testOptions.onUpdate;
      return { stop: vi.fn() };
    },
  };

  const originalContainer = new Container() as unknown as WebGALPixiContainer;
  const replacementContainer = new Container() as unknown as WebGALPixiContainer;
  let currentStageObject = { pixiContainer: originalContainer };

  generateTimelineObj(
    [
      { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, duration: 0, ease: 'linear' },
      { position: { x: 20, y: 30 }, scale: { x: 1.2, y: 0.8 }, duration: 100, ease: 'linear' },
    ],
    'hero',
    100,
    runtime,
  );

  currentStageObject = { pixiContainer: replacementContainer };
  originalContainer.destroy();

  expect(() => onUpdate?.({ x: 20, y: 30, scaleX: 1.2, scaleY: 0.8 })).not.toThrow();
  expect(replacementContainer).toMatchObject({
    x: 20,
    y: 30,
    scale: { x: 1.2, y: 0.8 },
  });
});
