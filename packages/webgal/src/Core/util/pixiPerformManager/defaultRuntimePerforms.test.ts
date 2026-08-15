import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { IPerformDefinition } from './pixiPerformManager';

const runtimePerformRoot = resolve(process.cwd(), 'public/game/pixi-performs');
const runtimeTextureRoot = resolve(process.cwd(), 'public/game/tex/effects');

const defaultPerforms = [
  ['rain', 'rain.js', 'rain.png'],
  ['snow', 'snow.js', 'snow.png'],
  ['heavySnow', 'heavySnow.js', 'snow.png'],
  ['cherryBlossoms', 'cherryBlossoms.js', 'cherryBlossoms.webp'],
] as const;

describe('default runtime Pixi performs', () => {
  test.each(defaultPerforms)('%s ships as an executable game script', (name, script, texture) => {
    const register = vi.fn<[string, IPerformDefinition], void>();
    const source = readFileSync(resolve(runtimePerformRoot, script), 'utf8');
    const execute = new Function('window', source) as (runtimeWindow: unknown) => void;

    execute({ WebGALPixiPerform: { register } });

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(
      name,
      expect.objectContaining({ fg: expect.any(Function), bg: expect.any(Function) }),
    );
    expect(source).toContain(`./game/tex/effects/${texture}`);
    expect(statSync(resolve(runtimeTextureRoot, texture)).size).toBeGreaterThan(0);
  });

  test('no default perform implementation remains in the engine compile-time directory', () => {
    const compiledPerformRoot = resolve(process.cwd(), 'src/Core/gameScripts/pixi/performs');
    const compiledPerforms = existsSync(compiledPerformRoot)
      ? readdirSync(compiledPerformRoot).filter((file) => /\.(?:[jt]sx?)$/.test(file))
      : [];

    expect(compiledPerforms).toEqual([]);
  });
});
