import { assetSetter, fileType } from '@/Core/util/gameAssetsAccess/assetSetter';

export interface IComposeFigureLayer {
  url: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export function normalizeCompositeAlias(raw: string): string {
  let value = raw.trim().replace(/\\/g, '/');
  try {
    value = decodeURIComponent(value);
  } catch {
    // 保留原始别名即可。
  }
  value = value.replace(/^[.][/\\]game[/\\]figure[/\\]/, '');
  value = value.replace(/^game[/\\]figure[/\\]/, '');
  const figurePathIndex = value.indexOf('/game/figure/');
  if (figurePathIndex >= 0) {
    value = value.slice(figurePathIndex + '/game/figure/'.length);
  }
  return value;
}

export function parseComposeFigureLayers(base: string | null, rawLayers: string[]): IComposeFigureLayer[] {
  const layers: IComposeFigureLayer[] = [];
  const baseSrc = normalizeLayerSegment(base ?? '');
  if (baseSrc) {
    layers.push({ url: resolveFigureLayerUrl(baseSrc) });
  }
  for (const rawLayer of rawLayers) {
    const layer = parseLayerArg(rawLayer);
    if (layer) layers.push(layer);
  }
  return layers;
}

function parseLayerArg(rawLayer: string): IComposeFigureLayer | undefined {
  const [src, x, y, width, height] = rawLayer.split(',').map(normalizeLayerSegment);
  if (!src) return undefined;
  return {
    url: resolveFigureLayerUrl(src),
    x: getFiniteLayerNumber(x),
    y: getFiniteLayerNumber(y),
    width: getPositiveLayerNumber(width),
    height: getPositiveLayerNumber(height),
  };
}

function normalizeLayerSegment(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function getFiniteLayerNumber(value: unknown): number | undefined {
  if (value === '') return undefined;
  const numberValue = typeof value === 'string' ? Number(value) : value;
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : undefined;
}

function getPositiveLayerNumber(value: unknown): number | undefined {
  const numberValue = getFiniteLayerNumber(value);
  return numberValue !== undefined && numberValue > 0 ? numberValue : undefined;
}

function resolveFigureLayerUrl(layerName: string): string {
  if (layerName.match(/^(https?:|data:|blob:|\.\/|\/)/)) {
    return layerName;
  }
  return assetSetter(layerName, fileType.figure);
}
