(() => {
  // Edit these values and refresh the preview. No engine rebuild is required.
  const config = {
    texture: './game/tex/effects/snow.png',
    foreground: { speed: 20, maxNumber: 1000, scale: 0.6, angle: -75 },
    background: { speed: 10, maxNumber: 2000, scale: 0.3, angle: -80 },
  };

  let instanceId = 0;

  function createSnow(layer, options) {
    const PIXI = window.PIXI;
    const stage = window.PIXIapp;
    if (!PIXI || !stage) throw new Error('Run "pixiInit;" before pixiPerform:heavySnow.');

    const effectsContainer =
      layer === 'foreground' ? stage.foregroundEffectsContainer : stage.backgroundEffectsContainer;
    const screenWidth = stage.stageWidth;
    const screenHeight = stage.stageHeight;
    const container = new PIXI.Container();
    const tickerKey = `runtime-heavy-snow-${layer}-${++instanceId}`;

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
    const snowflakes = [];
    const spriteSize = 128;
    const spriteCount = 10;
    const styleWeights = [10, 2, 2, 2, 1, 1, 1, 2, 2, 2];

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

    function resetSnowflake(snowflake, initialSpawn = false) {
      snowflake.scale.set(options.scale * (Math.random() * 0.5 + 0.5));
      snowflake.anchor.set(0.5);
      snowflake.x = Math.random() * effectWidth;
      snowflake.y = initialSpawn ? Math.random() * effectHeight : -Math.random() * 50 - snowflake.height;
      snowflake.alpha = Math.random() * 0.2 + 0.8;
      snowflake.vy = (Math.random() * 0.4 + 0.8) * options.speed;
      snowflake.vx = (Math.random() - 0.5) * 0.25 * options.speed;
      snowflake.rotationSpeed = (Math.random() - 0.5) * 0.005;
    }

    function createSnowflake() {
      const textureIndex = Math.max(0, Math.min(weightedRandomIndex(styleWeights), textures.length - 1));
      const snowflake = new PIXI.Sprite(textures[textureIndex]);
      resetSnowflake(snowflake, true);
      return snowflake;
    }

    function tickerFunc(delta) {
      for (const snowflake of snowflakes) {
        snowflake.y += snowflake.vy * delta;
        snowflake.x += snowflake.vx * delta;
        snowflake.rotation += snowflake.rotationSpeed * delta;
        if (
          snowflake.y - snowflake.height / 2 > effectHeight ||
          snowflake.x < -snowflake.width ||
          snowflake.x > effectWidth + snowflake.width
        ) {
          resetSnowflake(snowflake);
        }
      }
    }

    const baseTexture = PIXI.BaseTexture.from(config.texture);
    let initialized = false;
    const initialize = () => {
      if (initialized || container.destroyed || !baseTexture.valid) return;
      initialized = true;
      for (let index = 0; index < spriteCount; index += 1) {
        const frame = new PIXI.Rectangle(index * spriteSize, 0, spriteSize, spriteSize);
        textures.push(new PIXI.Texture(baseTexture, frame));
      }
      for (let index = 0; index < options.maxNumber; index += 1) {
        const snowflake = createSnowflake();
        particleContainer.addChild(snowflake);
        snowflakes.push(snowflake);
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

  window.WebGALPixiPerform.register('heavySnow', {
    fg: () => createSnow('foreground', config.foreground),
    bg: () => createSnow('background', config.background),
  });
})();
