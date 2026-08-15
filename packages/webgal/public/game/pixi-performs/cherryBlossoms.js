(() => {
  // Edit these values and refresh the preview. No engine rebuild is required.
  const config = {
    texture: './game/tex/effects/cherryBlossoms.webp',
    foreground: { speed: 2, horizontal: 3, maxNumber: 100, scale: 0.05, angle: 0 },
    background: { speed: 1, horizontal: 2, maxNumber: 300, scale: 0.025, angle: 0 },
  };

  let instanceId = 0;

  function createCherryBlossoms(layer, options) {
    const PIXI = window.PIXI;
    const stage = window.PIXIapp;
    if (!PIXI || !stage) throw new Error('Run "pixiInit;" before pixiPerform:cherryBlossoms.');

    const effectsContainer =
      layer === 'foreground' ? stage.foregroundEffectsContainer : stage.backgroundEffectsContainer;
    const screenWidth = stage.stageWidth;
    const screenHeight = stage.stageHeight;
    const container = new PIXI.Container();
    const tickerKey = `runtime-cherry-blossoms-${layer}-${++instanceId}`;

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

    const blossoms = [];
    const texture = PIXI.Texture.from(config.texture);
    const randomRange = (min, max) => min + Math.random() * (max - min);

    for (let index = 0; index < options.maxNumber; index += 1) {
      const scalePhase = Math.random() * Math.PI * 2;
      const blossom = PIXI.Sprite.from(texture);
      blossom.anchor.set(0.5);
      blossom.x = Math.random() * effectWidth;
      blossom.y = Math.random() * effectHeight;
      blossom.rotation = Math.random() * Math.PI * 2;
      blossom.scale.set(Math.cos(scalePhase) * options.scale, Math.sin(scalePhase) * options.scale);
      blossom.speed = (randomRange(0.5, 2) + randomRange(0.1, 1)) * options.speed;
      blossom.rotationSpeed = Math.random() * 0.015 * (Math.random() < 0.5 ? 1 : -1);
      blossom.positionPhase = Math.random() * Math.PI * 2;
      blossom.scalePhase = scalePhase;
      blossoms.push(blossom);
      particleContainer.addChild(blossom);
    }

    function tickerFunc(delta) {
      const currentTime = Date.now() / 1000;
      for (const blossom of blossoms) {
        blossom.x += Math.sin(currentTime + blossom.positionPhase) * options.horizontal * delta;
        blossom.y += blossom.speed * delta;
        blossom.rotation += blossom.rotationSpeed * delta;
        blossom.scale.set(
          Math.cos(currentTime + blossom.scalePhase) * options.scale,
          Math.sin(currentTime + blossom.scalePhase) * options.scale,
        );

        const spriteWidth = Math.abs(blossom.width * options.scale);
        const spriteHeight = Math.abs(blossom.height * options.scale);
        if (blossom.x + spriteWidth / 2 < -effectWidth) blossom.x = effectWidth + spriteWidth / 2;
        else if (blossom.x - spriteWidth / 2 > effectWidth) blossom.x = -effectWidth - spriteWidth / 2;

        if (blossom.y - spriteHeight / 2 > effectHeight) {
          blossom.x = Math.random() * effectWidth;
          blossom.y = -Math.random() * 50 - spriteHeight;
          blossom.positionPhase = Math.random() * Math.PI * 2;
          blossom.scalePhase = Math.random() * Math.PI * 2;
          blossom.speed = (randomRange(0.5, 2) + randomRange(0.1, 1)) * options.speed;
          blossom.rotationSpeed = Math.random() * 0.015 * (Math.random() < 0.5 ? 1 : -1);
        }
      }
    }

    stage.registerAnimation({ setStartState: () => {}, setEndState: () => {}, tickerFunc }, tickerKey);
    stage.requestRender();
    return { container, tickerKey };
  }

  window.WebGALPixiPerform.register('cherryBlossoms', {
    fg: () => createCherryBlossoms('foreground', config.foreground),
    bg: () => createCherryBlossoms('background', config.background),
  });
})();
