import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { createNonePerform, IPerform } from '@/Core/Modules/perform/performInterface';
import { WebGAL } from '@/Core/WebGAL';
import { getBooleanArgByKey, getNumberArgByKey, getStringArgByKey } from '@/Core/util/getSentenceArg';
import { logger } from '@/Core/util/logger';
import { IComposeFigureLayer, normalizeCompositeAlias, parseComposeFigureLayers } from '@/Core/gameScripts/composeFigureLayers';

interface IComposedFigureEntry {
  url: string;
  signature: string;
}

const COMPOSE_FIGURE_PERFORM_DURATION = 24 * 60 * 60 * 1000;
const composedFigureRegistry = new Map<string, IComposedFigureEntry>();

/**
 * 读取合成立绘别名对应的普通图片 URL。
 */
export function getComposedFigureUrl(aliasOrPath: string): string | undefined {
  for (const candidate of getAliasCandidates(aliasOrPath)) {
    const entry = composedFigureRegistry.get(candidate);
    if (entry) return entry.url;
  }
  return undefined;
}

export function getComposedFigureDebugInfo(aliasOrPath: string) {
  const candidates = getAliasCandidates(aliasOrPath);
  const foundAlias = candidates.find((candidate) => composedFigureRegistry.has(candidate)) ?? '';
  const foundEntry = foundAlias ? composedFigureRegistry.get(foundAlias) : undefined;
  return {
    input: aliasOrPath,
    candidates,
    foundAlias,
    foundUrl: foundEntry?.url ?? '',
    foundSignature: foundEntry?.signature ?? '',
    registeredAliases: Array.from(composedFigureRegistry.keys()),
  };
}

export function clearComposedFigures() {
  for (const entry of composedFigureRegistry.values()) {
    if (entry.url.startsWith('blob:')) {
      URL.revokeObjectURL(entry.url);
    }
  }
  composedFigureRegistry.clear();
}

/**
 * 运行时合成普通立绘，并以 sentence.content 作为别名登记。
 */
export function composeFigure(sentence: ISentence): IPerform {
  const alias = normalizeCompositeAlias(sentence.content);
  const rawBase = getStringArgByKey(sentence, 'base');
  const rawLayerArgs = sentence.args
    .filter((arg) => arg.key === 'layer' && typeof arg.value === 'string')
    .map((arg) => arg.value as string);
  const layers = parseComposeFigureLayers(rawBase, rawLayerArgs);
  const width = getPositiveIntegerArg(sentence, 'width');
  const height = getPositiveIntegerArg(sentence, 'height');
  const mimeType = getMimeType(getStringArgByKey(sentence, 'format'));
  const quality = getQualityArg(sentence);
  const signature = buildSignature({ layers, width, height, mimeType, quality });
  logger.info('[composeFigure] parsed sentence', {
    rawAlias: sentence.content,
    alias,
    rawBase,
    rawLayers: rawLayerArgs,
    layers: layers.map(describeLayerForLog),
    width,
    height,
    mimeType,
    quality,
    signature,
  });

  if (!alias) {
    logger.warn('composeFigure 缺少合成立绘别名，已跳过');
    return createNonePerform();
  }
  if (layers.length === 0) {
    logger.warn(`composeFigure:${alias} 缺少 base/layer 参数，已跳过`);
    return createNonePerform();
  }
  if (isComposedFigureReady(alias, signature)) {
    logger.info('[composeFigure] cache hit', getComposedFigureDebugInfo(alias));
    return createNonePerform({ blockingAuto: false });
  }

  const performName = `composeFigure-${alias}`;
  let isDone = false;
  let shouldIgnoreResult = false;
  let compositionPromise: Promise<void> | null = null;

  const finish = () => {
    if (isDone) return;
    isDone = true;
    WebGAL.gameplay.performController.unmountPerform(performName);
  };

  const runComposition = () => {
    if (compositionPromise) {
      return compositionPromise;
    }
    logger.info('[composeFigure] start compose perform', {
      alias,
      performName,
      layers: layers.map(describeLayerForLog),
      width,
      height,
      mimeType,
      quality,
    });
    compositionPromise = composeLayerUrls({ layers, width, height, mimeType, quality })
      .then((url) => {
        if (!shouldIgnoreResult) {
          logger.info('[composeFigure] compose success, registering alias', { alias, url, signature });
          registerComposedFigure(alias, url, signature);
        } else {
          logger.warn('[composeFigure] compose success but result ignored, revoking blob', { alias, url });
          URL.revokeObjectURL(url);
        }
      })
      .catch((error) => {
        logger.error(`composeFigure:${alias} 合成失败`, error);
      })
      .finally(finish);
    return compositionPromise;
  };

  return {
    performName,
    duration: COMPOSE_FIGURE_PERFORM_DURATION,
    isHoldOn: false,
    startFunction: () => {
      if (isDone) return;
      void runComposition();
    },
    stopFunction: () => {
      if (!isDone) {
        logger.warn('[composeFigure] stop before compose finished, future result will be ignored', { alias, performName });
        shouldIgnoreResult = true;
      }
    },
    blockingNext: () => !isDone,
    blockingAuto: () => !isDone,
    blockingStateCalculation: () => !isDone,
    resolveStateCalculation: runComposition,
    goNextWhenOver: getBooleanArgByKey(sentence, 'next') ?? false,
  };
}

function isComposedFigureReady(alias: string, signature: string): boolean {
  return composedFigureRegistry.get(alias)?.signature === signature;
}

function registerComposedFigure(alias: string, url: string, signature: string) {
  const oldEntry = composedFigureRegistry.get(alias);
  if (oldEntry?.url.startsWith('blob:')) {
    logger.info('[composeFigure] revoke old blob before register', { alias, oldUrl: oldEntry.url });
    URL.revokeObjectURL(oldEntry.url);
  }
  composedFigureRegistry.set(alias, { url, signature });
  logger.info('[composeFigure] registered aliases', {
    alias,
    url,
    signature,
    registeredAliases: Array.from(composedFigureRegistry.keys()),
  });
}

function getAliasCandidates(aliasOrPath: string): string[] {
  const normalized = normalizeCompositeAlias(aliasOrPath);
  return [...new Set([aliasOrPath, normalized].filter((value) => value !== ''))];
}

function getPositiveIntegerArg(sentence: ISentence, key: string): number | undefined {
  const value = getNumberArgByKey(sentence, key);
  if (value === null || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

function getQualityArg(sentence: ISentence): number | undefined {
  const quality = getNumberArgByKey(sentence, 'quality');
  if (quality === null || !Number.isFinite(quality)) return undefined;
  return Math.max(0, Math.min(1, quality));
}

function getMimeType(format: string | null): string {
  const normalized = (format ?? 'png').toLowerCase();
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg';
  if (normalized === 'webp') return 'image/webp';
  return 'image/png';
}

function buildSignature(params: {
  layers: IComposeFigureLayer[];
  width: number | undefined;
  height: number | undefined;
  mimeType: string;
  quality: number | undefined;
}): string {
  return JSON.stringify(params);
}

async function composeLayerUrls(params: {
  layers: IComposeFigureLayer[];
  width: number | undefined;
  height: number | undefined;
  mimeType: string;
  quality: number | undefined;
}): Promise<string> {
  logger.info('[composeFigure] load layers start', {
    layers: params.layers.map(describeLayerForLog),
    width: params.width,
    height: params.height,
    mimeType: params.mimeType,
    quality: params.quality,
  });
  const layerImages = await Promise.all(
    params.layers.map(async (layer, index) => {
      logger.info('[composeFigure] load layer start', { index, layer: describeLayerForLog(layer) });
      const image = await loadImage(layer.url);
      logger.info('[composeFigure] load layer success', {
        index,
        url: layer.url,
        naturalWidth: getImageWidth(image),
        naturalHeight: getImageHeight(image),
      });
      return { layer, image };
    }),
  );
  const canvas = document.createElement('canvas');
  canvas.width = params.width ?? Math.max(...layerImages.map(({ image, layer }) => getLayerExtentX(image, layer)));
  canvas.height = params.height ?? Math.max(...layerImages.map(({ image, layer }) => getLayerExtentY(image, layer)));
  logger.info('[composeFigure] canvas prepared', {
    width: canvas.width,
    height: canvas.height,
    inferredWidth: params.width === undefined,
    inferredHeight: params.height === undefined,
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable');
  }
  layerImages.forEach(({ image, layer }, index) => {
    logger.info('[composeFigure] draw layer', {
      index,
      layer: describeLayerForLog(layer),
      imageWidth: getImageWidth(image),
      imageHeight: getImageHeight(image),
    });
    drawLayer(ctx, image, layer);
  });
  const blob = await canvasToBlob(canvas, params.mimeType, params.quality);
  const url = URL.createObjectURL(blob);
  logger.info('[composeFigure] canvas export success', {
    blobUrl: url,
    blobType: blob.type,
    blobSize: blob.size,
    mimeType: params.mimeType,
    quality: params.quality,
  });
  return url;
}

function describeLayerForLog(layer: IComposeFigureLayer) {
  return {
    url: layer.url,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
  };
}

function drawLayer(ctx: CanvasRenderingContext2D, image: HTMLImageElement, layer: IComposeFigureLayer) {
  const x = layer.x ?? 0;
  const y = layer.y ?? 0;
  if (layer.width !== undefined && layer.height !== undefined) {
    ctx.drawImage(image, x, y, layer.width, layer.height);
    return;
  }
  ctx.drawImage(image, x, y);
}

function getLayerExtentX(image: HTMLImageElement, layer: IComposeFigureLayer): number {
  return (layer.x ?? 0) + (layer.width ?? getImageWidth(image));
}

function getLayerExtentY(image: HTMLImageElement, layer: IComposeFigureLayer): number {
  return (layer.y ?? 0) + (layer.height ?? getImageHeight(image));
}

function getImageWidth(image: HTMLImageElement): number {
  return image.naturalWidth || image.width;
}

function getImageHeight(image: HTMLImageElement): number {
  return image.naturalHeight || image.height;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load figure layer: ${url}`));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number | undefined): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Failed to export composed figure as ${mimeType}`));
        }
      },
      mimeType,
      quality,
    );
  });
}
