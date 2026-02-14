import * as PIXI from 'pixi.js';
import { registerPerform } from '@/Core/util/pixiPerformManager/pixiPerformManager';
import { WebGAL } from '@/Core/WebGAL';
import { SCREEN_CONSTANTS } from '@/Core/util/constants';

type EffectLayer = 'foreground' | 'background';
type ScaleMode = 'none' | 'cover' | 'contain';

interface EffectDefinition {
  name: string;
  file: string;
  layer?: EffectLayer;
  scaleMode?: ScaleMode;
  alpha?: number;
}

const EFFECT_DEFINITIONS: EffectDefinition[] = [
  { name: 'effect.1', file: '飞书20260208-171542.webp' },
  { name: 'effect.2', file: '飞书20260208-171543.webp' },
  { name: 'effect.3', file: '飞书20260208-171545.webp' },
  { name: 'effect.4', file: '飞书20260208-171546.webp' },
  { name: 'effect.5', file: '飞书20260208-171548.webp' },
  { name: 'effect.6', file: '飞书20260208-171549.webp' },
  { name: 'effect.7', file: '飞书20260208-171550.webp' },
  { name: 'effect.8', file: '飞书20260208-171552.webp' },
  { name: 'effect.9', file: '飞书20260208-171553.webp' },
  { name: 'effect.10', file: '飞书20260208-171555.webp' },
  { name: 'effect.11', file: '飞书20260208-171556.webp' },
  { name: 'effect.12', file: '飞书20260208-171557.webp' },
  { name: 'effect.13', file: '飞书20260208-171558.webp' },
  { name: 'effect.14', file: '飞书20260208-171627.webp' },
];

const DEFAULT_LAYER: EffectLayer = 'foreground';
const DEFAULT_SCALE_MODE: ScaleMode = 'none';

function createSequenceEffect(definition: EffectDefinition) {
  const pixiStage = WebGAL.gameplay.pixiStage!;
  const effectsContainer =
    (definition.layer ?? DEFAULT_LAYER) === 'background'
      ? pixiStage.backgroundEffectsContainer
      : pixiStage.foregroundEffectsContainer;

  const container = new PIXI.Container();
  const texturePath = `./game/tex/effects/${definition.file}`;
  const sprite = new PIXI.Sprite(PIXI.Texture.from(texturePath));
  sprite.anchor.set(0.5);
  sprite.alpha = definition.alpha ?? 1;

  container.position.set(SCREEN_CONSTANTS.width / 2, SCREEN_CONSTANTS.height / 2);
  container.addChild(sprite);
  effectsContainer.addChild(container);

  const applySize = () => {
    const scaleMode = definition.scaleMode ?? DEFAULT_SCALE_MODE;
    if (scaleMode === 'none') return;
    const baseTexture = sprite.texture.baseTexture;
    const width = baseTexture.width || sprite.texture.width || 1;
    const height = baseTexture.height || sprite.texture.height || 1;
    const scaleX = SCREEN_CONSTANTS.width / width;
    const scaleY = SCREEN_CONSTANTS.height / height;
    const scale =
      scaleMode === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
    sprite.scale.set(scale);
  };

  if (sprite.texture.baseTexture.valid) {
    applySize();
  } else {
    sprite.texture.baseTexture.once('loaded', applySize);
  }

  return { container, tickerKey: `${definition.name}-ticker` };
}

for (const definition of EFFECT_DEFINITIONS) {
  registerPerform(definition.name, {
    fg: () => createSequenceEffect(definition),
  });
}
