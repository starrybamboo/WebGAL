(() => {
  // Edit these values and refresh the preview. No engine rebuild is required.
  const config = {
    texture: './game/tex/effects/rain.png',
    foreground: { speed: 30, maxNumber: 50, scale: 0.4, angle: 1 },
    background: { speed: 20, maxNumber: 150, scale: 0.3, angle: 1 },
  };

  let instanceId = 0;

  function createRain(layer, options) {
    const PIXI = window.PIXI;
    const stage = window.PIXIapp;
    if (!PIXI || !stage) throw new Error('Run "pixiInit;" before pixiPerform:rain.');

    const effectsContainer =
      layer === 'foreground' ? stage.foregroundEffectsContainer : stage.backgroundEffectsContainer;
    const screenWidth = stage.stageWidth;
    const screenHeight = stage.stageHeight;
    const container = new PIXI.Container();
    const tickerKey = `runtime-rain-${layer}-${++instanceId}`;

    container.angle = options.angle;
    const absCos = Math.abs(Math.cos(container.rotation));
    const absSin = Math.abs(Math.sin(container.rotation));
    const effectWidth = screenWidth * absCos + screenHeight * absSin;
    const effectHeight = screenWidth * absSin + screenHeight * absCos;
    container.width = effectWidth;
    container.height = effectHeight;
    container.pivot.set(effectWidth / 2, effectHeight / 2);
    container.position.set(screenWidth / 2, screenHeight / 2);
    effectsContainer.addChild(container);

    const particleContainer = new PIXI.ParticleContainer(options.maxNumber, {
      scale: true,
      position: true,
      rotation: true,
      alpha: true,
      uvs: false,
    });
    container.addChild(particleContainer);

    const textures = [];
    const raindrops = [];
    const spriteWidth = 128;
    const spriteHeight = 640;
    const spriteCount = 5;
    const styleWeights = [10, 5, 2, 2, 1];

    function weightedRandomIndex(weights) {
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      if (totalWeight <= 0) return Math.floor(Math.random() * weights.length);
      let random = Math.random() * totalWeight;
      for (let index = 0; index < weights.length; index += 1) {
        if (random < weights[index]) return index;
        random -= weights[index];
      }
      return weights.length - 1;
    }

    function resetRaindrop(raindrop, initialSpawn = false) {
      raindrop.scale.set(options.scale * (Math.random() * 0.5 + 0.5));
      raindrop.anchor.set(0.5);
      raindrop.x = Math.random() * effectWidth;
      raindrop.y = initialSpawn ? Math.random() * effectHeight : -Math.random() * 50 - raindrop.height;
      raindrop.alpha = Math.random() * 0.5 + 0.5;
      raindrop.vy = (Math.random() * 0.4 + 0.8) * options.speed;
    }

    function createRaindrop() {
      const textureIndex = Math.max(0, Math.min(weightedRandomIndex(styleWeights), textures.length - 1));
      const raindrop = new PIXI.Sprite(textures[textureIndex]);
      resetRaindrop(raindrop, true);
      return raindrop;
    }

    function tickerFunc(delta) {
      for (const raindrop of raindrops) {
        raindrop.y += raindrop.vy * delta;
        if (
          raindrop.y - raindrop.height / 2 > effectHeight ||
          raindrop.x < -raindrop.width ||
          raindrop.x > effectWidth + raindrop.width
        ) {
          resetRaindrop(raindrop);
        }
      }
    }

    const baseTexture = PIXI.BaseTexture.from(config.texture);
    let initialized = false;
    const initialize = () => {
      if (initialized || container.destroyed || !baseTexture.valid) return;
      initialized = true;
      for (let index = 0; index < spriteCount; index += 1) {
        const frame = new PIXI.Rectangle(index * spriteWidth, 0, spriteWidth, spriteHeight);
        textures.push(new PIXI.Texture(baseTexture, frame));
      }
      for (let index = 0; index < options.maxNumber; index += 1) {
        const raindrop = createRaindrop();
        particleContainer.addChild(raindrop);
        raindrops.push(raindrop);
      }
      stage.registerAnimation({ setStartState: () => {}, setEndState: () => {}, tickerFunc }, tickerKey);
      stage.requestRender();
    };

    if (baseTexture.valid) initialize();
    else {
      baseTexture.once('loaded', initialize);
      baseTexture.once('error', (error) => console.error(`Failed to load ${config.texture}.`, error));
    }

    return { container, tickerKey };
  }

  window.WebGALPixiPerform.register('rain', {
    fg: () => createRain('foreground', config.foreground),
    bg: () => createRain('background', config.background),
  });
})();
