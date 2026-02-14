import * as PIXI from 'pixi.js';
import { registerPerform } from '@/Core/util/pixiPerformManager/pixiPerformManager';
import { WebGAL } from '@/Core/WebGAL';
import { SCREEN_CONSTANTS } from '@/Core/util/constants';

type ContainerType = 'foreground' | 'background';

interface BurstParticle {
  node: PIXI.Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  spin: number;
  baseScale: number;
}

const createParticleNode = (accent = false): PIXI.Graphics => {
  const node = new PIXI.Graphics();
  const color = accent ? 0xffc06b : 0x8ab6ff;
  const alpha = accent ? 0.95 : 0.8;
  const size = accent ? 10 : 7;
  node.beginFill(color, alpha);
  node.drawRoundedRect(-size / 2, -size / 2, size, size, 2);
  node.endFill();
  node.blendMode = PIXI.BLEND_MODES.ADD;
  return node;
};

const resetParticle = (particle: BurstParticle, spread = 220, speedBase = 2.1) => {
  const angle = Math.random() * Math.PI * 2;
  const speed = speedBase + Math.random() * 3.3;
  particle.vx = Math.cos(angle) * speed;
  particle.vy = Math.sin(angle) * speed;
  particle.maxLife = 22 + Math.random() * 20;
  particle.life = particle.maxLife;
  particle.spin = (Math.random() - 0.5) * 0.32;
  particle.baseScale = 0.45 + Math.random() * 0.6;
  particle.node.position.set((Math.random() - 0.5) * spread * 0.12, (Math.random() - 0.5) * spread * 0.12);
  particle.node.scale.set(particle.baseScale);
  particle.node.alpha = 0.96;
};

interface TrpgDiceBurstConfig {
  tickerKey: string;
  containerType: ContainerType;
  particleCount: number;
  spread: number;
}

const createTrpgDiceBurst = (config: TrpgDiceBurstConfig) => {
  const { tickerKey, containerType, particleCount, spread } = config;
  const pixiStage = WebGAL.gameplay.pixiStage!;
  const effectsContainer =
    containerType === 'foreground' ? pixiStage.foregroundEffectsContainer : pixiStage.backgroundEffectsContainer;

  const container = new PIXI.Container();
  container.position.set(SCREEN_CONSTANTS.width / 2, SCREEN_CONSTANTS.height / 2);
  effectsContainer.addChild(container);

  const ring = new PIXI.Graphics();
  ring.lineStyle(3, 0xffd9a3, 0.78);
  ring.drawCircle(0, 0, 64);
  ring.endFill();
  ring.blendMode = PIXI.BLEND_MODES.ADD;
  container.addChild(ring);

  const particles: BurstParticle[] = [];
  for (let index = 0; index < particleCount; index += 1) {
    const node = createParticleNode(index % 3 === 0);
    container.addChild(node);
    const particle: BurstParticle = {
      node,
      vx: 0,
      vy: 0,
      life: 1,
      maxLife: 1,
      spin: 0,
      baseScale: 1,
    };
    resetParticle(particle, spread);
    particles.push(particle);
  }

  let pulse = 0;
  const tickerFunc = (delta: number) => {
    pulse += delta * 0.085;
    const pulseScale = 1 + Math.sin(pulse) * 0.1;
    ring.scale.set(pulseScale);
    ring.alpha = 0.55 + Math.sin(pulse * 1.9) * 0.2;

    for (const particle of particles) {
      particle.life -= delta;
      if (particle.life <= 0) {
        resetParticle(particle, spread);
        continue;
      }
      const ratio = particle.life / particle.maxLife;
      particle.node.x += particle.vx * delta * 1.7;
      particle.node.y += particle.vy * delta * 1.7;
      particle.node.rotation += particle.spin * delta;
      particle.node.alpha = ratio;
      const scale = particle.baseScale * (0.7 + ratio * 0.5);
      particle.node.scale.set(scale);
    }
  };

  pixiStage.registerAnimation(
    {
      setStartState: () => {},
      setEndState: () => {},
      tickerFunc,
    },
    tickerKey,
  );

  return { container, tickerKey };
};

registerPerform('effect.trpgDiceBurst', {
  fg: () =>
    createTrpgDiceBurst({
      tickerKey: 'trpg-dice-burst-fg',
      containerType: 'foreground',
      particleCount: 34,
      spread: 260,
    }),
  bg: () =>
    createTrpgDiceBurst({
      tickerKey: 'trpg-dice-burst-bg',
      containerType: 'background',
      particleCount: 22,
      spread: 190,
    }),
});
