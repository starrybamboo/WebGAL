import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { WebGAL } from '@/Core/WebGAL';
import { initState, stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { applyAnimationEndState, getAnimationTimeline } from './animationFunctions';

const target = '1';

beforeEach(() => {
  stageStateManager.resetCalculationStageState(initState);
  stageStateManager.setFreeFigureByKey({ key: target, name: 'figure.png', basePosition: 'center' });
  stageStateManager.updateEffect({
    target,
    transform: {
      position: { x: -840, y: 330 },
      scale: { x: 1.2, y: 1.2 },
      rotation: 0.25,
      alpha: 0.8,
    },
  });
  vi.spyOn(WebGAL.animationManager, 'getAnimations').mockReturnValue([
    {
      name: 'jump',
      frameMode: 'relative',
      effects: [
        {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          alpha: 1,
          duration: 0,
          ease: 'linear',
        },
        {
          position: { x: 30, y: -20 },
          scale: { x: 1.1, y: 0.9 },
          rotation: 0.5,
          alpha: 1,
          duration: 100,
          ease: 'linear',
        },
      ],
    },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('explicitly relative animation frames compose with the target transform', () => {
  const timeline = getAnimationTimeline('jump', target, false);

  expect(timeline?.[0]).toMatchObject({
    position: { x: -840, y: 330 },
    scale: { x: 1.2, y: 1.2 },
    rotation: 0.25,
    alpha: 0.8,
  });
  expect(timeline?.[1]).toMatchObject({
    position: { x: -810, y: 310 },
    scale: { x: 1.32, y: 1.08 },
    rotation: 0.75,
    alpha: 0.8,
  });
});

test('a neutral terminal frame naturally settles back to the transformed figure position', () => {
  vi.mocked(WebGAL.animationManager.getAnimations).mockReturnValue([
    {
      name: 'jump',
      frameMode: 'relative',
      effects: [
        { position: { x: 0, y: 0 }, duration: 0, ease: 'linear' },
        { position: { x: 0, y: -30 }, duration: 100, ease: 'linear' },
        { position: { x: 0, y: 0 }, duration: 100, ease: 'linear' },
      ],
    },
  ]);

  applyAnimationEndState('jump', target, false);

  expect(
    stageStateManager.getCalculationStageState().effects.find((effect) => effect.target === target)?.transform,
  ).toMatchObject({ position: { x: -840, y: 330 }, scale: { x: 1.2, y: 1.2 }, rotation: 0.25 });
});

test('a renamed exit target composes from its live Pixi transform', () => {
  stageStateManager.removeEffectByTargetId(target);
  const previousPixiStage = WebGAL.gameplay.pixiStage;
  WebGAL.gameplay.pixiStage = {
    getStageObjByKey: () => ({
      pixiContainer: {
        x: -840,
        y: 330,
        scale: { x: 1.2, y: 1.2 },
        rotation: 0.25,
        alpha: 1,
        alphaFilterVal: 0.8,
      },
    }),
  } as unknown as typeof WebGAL.gameplay.pixiStage;

  try {
    expect(getAnimationTimeline('jump', target, false)?.[1]).toMatchObject({
      position: { x: -810, y: 310 },
      scale: { x: 1.32, y: 1.08 },
      rotation: 0.75,
      alpha: 0.8,
    });
  } finally {
    WebGAL.gameplay.pixiStage = previousPixiStage;
  }
});

test('unmarked timelines keep the community absolute-frame semantics', () => {
  vi.mocked(WebGAL.animationManager.getAnimations).mockReturnValue([
    {
      name: 'transform',
      effects: [
        { position: { x: -840, y: 330 }, duration: 0, ease: 'linear' },
        { position: { x: -800, y: 300 }, duration: 100, ease: 'linear' },
      ],
    },
  ]);

  const timeline = getAnimationTimeline('transform', target, false);

  expect(timeline?.[0].position).toEqual({ x: -840, y: 330 });
  expect(timeline?.[1].position).toEqual({ x: -800, y: 300 });
});

test('an unmarked renamed target keeps the community default-transform fallback', () => {
  stageStateManager.removeEffectByTargetId(target);
  const previousPixiStage = WebGAL.gameplay.pixiStage;
  WebGAL.gameplay.pixiStage = {
    getStageObjByKey: () => ({
      pixiContainer: {
        x: -840,
        y: 330,
        scale: { x: 1.2, y: 1.2 },
        rotation: 0.25,
        alpha: 0.8,
      },
    }),
  } as unknown as typeof WebGAL.gameplay.pixiStage;
  vi.mocked(WebGAL.animationManager.getAnimations).mockReturnValue([
    {
      name: 'absolute-exit',
      effects: [{ alpha: 0, duration: 100, ease: 'linear' }],
    },
  ]);

  try {
    expect(getAnimationTimeline('absolute-exit', target, false)?.[0]).toMatchObject({
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      alpha: 0,
    });
  } finally {
    WebGAL.gameplay.pixiStage = previousPixiStage;
  }
});

test('writeDefault keeps the official absolute-frame escape hatch', () => {
  const timeline = getAnimationTimeline('jump', target, true);

  expect(timeline?.[1]).toMatchObject({
    position: { x: 30, y: -20 },
    scale: { x: 1.1, y: 0.9 },
    rotation: 0.5,
  });
});

test('writeDefault still starts from the complete default transform when defaults are otherwise ignored', () => {
  const timeline = getAnimationTimeline('jump', target, true, false);

  expect(timeline?.[1]).toMatchObject({
    position: { x: 30, y: -20 },
    brightness: 1,
    colorRed: 255,
  });
});
