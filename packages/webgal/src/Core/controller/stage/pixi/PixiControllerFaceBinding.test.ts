import { expect, test, vi } from 'vitest';
import PixiStage from './PixiController';

test('releasing a Figure face binding by UUID is reentrant and idempotent', () => {
  const pixiStage = Object.create(PixiStage.prototype) as PixiStage;
  const release = vi.fn(() => pixiStage.releaseFigureFaceByUuid('figure-uuid'));
  Reflect.set(pixiStage, 'figureFaceReleases', new Map([['figure-uuid', release]]));

  pixiStage.releaseFigureFaceByUuid('figure-uuid');
  pixiStage.releaseFigureFaceByUuid('figure-uuid');

  expect(release).toHaveBeenCalledTimes(1);
});
