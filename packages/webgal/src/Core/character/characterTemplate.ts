export interface ICharacterSelector {
  characterName: string;
  items: string[];
}

export interface ICharacterCanvas {
  width: number;
  height: number;
}

export interface ICharacterComponent {
  src: string;
  x: number;
  y: number;
  scale?: number;
}

export interface ICharacterTemplate {
  Version: 1;
  canvas: ICharacterCanvas;
  components: Record<string, ICharacterComponent>;
  presets?: Record<string, string[]>;
}

export interface ICharacterCompositionLayer extends ICharacterComponent {
  name: string;
  scale: number;
}

export interface ICharacterComposition {
  canvas: ICharacterCanvas;
  layers: ICharacterCompositionLayer[];
}

const MAX_CHARACTER_CANVAS_EDGE = 8192;
const MAX_CHARACTER_CANVAS_PIXELS = 16_777_216;

export class CharacterTemplateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CharacterTemplateError';
  }
}

export function parseCharacterSelector(rawSelector: string): ICharacterSelector {
  const selector = rawSelector.trim();
  const separatorIndex = selector.indexOf('/');
  const characterName = (separatorIndex >= 0 ? selector.slice(0, separatorIndex) : selector).trim();
  if (!characterName || characterName === '.' || characterName === '..' || /[\\/%?#]/.test(characterName)) {
    throw new CharacterTemplateError(`非法角色名：${characterName || '(空)'}`);
  }

  if (separatorIndex < 0) {
    return { characterName, items: [] };
  }

  const rawItems = selector.slice(separatorIndex + 1);
  const items = rawItems.split(',').map((item) => item.trim());
  if (items.length === 0 || items.some((item) => item === '')) {
    throw new CharacterTemplateError(`角色 ${characterName} 的组合列表不能为空`);
  }
  return { characterName, items };
}

export function resolveCharacterTemplateSelection(
  template: ICharacterTemplate,
  items: string[],
): ICharacterComposition {
  validateCharacterTemplate(template);
  if (items.length === 0) {
    throw new CharacterTemplateError('组合列表不能为空');
  }

  const layers: ICharacterCompositionLayer[] = [];
  const expandItem = (name: string): void => {
    if (hasOwn(template.components, name)) {
      const component = template.components[name];
      layers.push({ name, ...component, scale: component.scale === undefined ? 1 : component.scale });
      return;
    }
    if (hasOwn(template.presets, name)) {
      const preset = template.presets![name];
      preset.forEach(expandItem);
      return;
    }
    throw new CharacterTemplateError(`未找到角色部件或预设：${name}`);
  };
  items.forEach((item) => expandItem(item));

  return {
    canvas: { ...template.canvas },
    layers,
  };
}

export function validateCharacterTemplate(template: ICharacterTemplate): void {
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    throw new CharacterTemplateError('角色模板必须是对象');
  }
  if (template.Version !== 1) {
    throw new CharacterTemplateError(`不支持的角色模板版本：${String(template.Version)}`);
  }
  if (!isPositiveInteger(template.canvas?.width) || !isPositiveInteger(template.canvas?.height)) {
    throw new CharacterTemplateError('角色模板画布宽高必须是正整数');
  }
  if (template.canvas.width > MAX_CHARACTER_CANVAS_EDGE || template.canvas.height > MAX_CHARACTER_CANVAS_EDGE) {
    throw new CharacterTemplateError(`角色模板画布单边不能超过 ${MAX_CHARACTER_CANVAS_EDGE}`);
  }
  if (template.canvas.width * template.canvas.height > MAX_CHARACTER_CANVAS_PIXELS) {
    throw new CharacterTemplateError(`角色模板画布总像素不能超过 ${MAX_CHARACTER_CANVAS_PIXELS}`);
  }
  if (!template.components || typeof template.components !== 'object' || Array.isArray(template.components)) {
    throw new CharacterTemplateError('角色模板 components 必须是对象');
  }
  if (
    template.presets !== undefined &&
    (!template.presets || typeof template.presets !== 'object' || Array.isArray(template.presets))
  ) {
    throw new CharacterTemplateError('角色模板 presets 必须是对象');
  }
  const duplicateName = Object.keys(template.presets ?? {}).find((name) => hasOwn(template.components, name));
  if (duplicateName) {
    throw new CharacterTemplateError(`角色模板部件与预设名称重复：${duplicateName}`);
  }
  Object.entries(template.components).forEach(([name, component]) => validateComponent(name, component));
  Object.entries(template.presets ?? {}).forEach(([presetName, preset]) => {
    if (!Array.isArray(preset) || preset.length === 0) {
      throw new CharacterTemplateError(`角色组合预设 ${presetName} 的列表不能为空`);
    }
    preset.forEach((item) => {
      if (typeof item !== 'string' || !item) {
        throw new CharacterTemplateError(`角色组合预设 ${presetName} 包含非法引用`);
      }
      if (!hasOwn(template.components, item) && !hasOwn(template.presets, item)) {
        throw new CharacterTemplateError(`角色组合预设 ${presetName} 引用了不存在的部件或预设：${item}`);
      }
    });
  });
  validatePresetCycles(template);
}

function validatePresetCycles(template: ICharacterTemplate): void {
  const visited = new Set<string>();
  const visit = (name: string, stack: string[]): void => {
    // visited 允许不同分支复用预设，只有当前递归链上的重复才构成循环。
    if (hasOwn(template.components, name) || visited.has(name)) {
      return;
    }
    const cycleStart = stack.indexOf(name);
    if (cycleStart >= 0) {
      const cycle = [...stack.slice(cycleStart), name].join(' -> ');
      throw new CharacterTemplateError(`角色组合预设存在循环引用：${cycle}`);
    }
    template.presets?.[name].forEach((item) => visit(item, [...stack, name]));
    visited.add(name);
  };
  Object.keys(template.presets ?? {}).forEach((name) => visit(name, []));
}

function validateComponent(name: string, component: ICharacterComponent) {
  if (!component || typeof component !== 'object' || typeof component.src !== 'string' || !component.src.trim()) {
    throw new CharacterTemplateError(`角色部件 ${name} 缺少有效的 src`);
  }
  validateCharacterComponentPath(component.src);
  const scale = component.scale === undefined ? 1 : component.scale;
  if (![component.x, component.y, scale].every(Number.isFinite) || scale <= 0) {
    throw new CharacterTemplateError(`角色部件 ${name} 的 x、y、scale 必须是有效数值，且 scale 大于 0`);
  }
}

export function validateCharacterComponentPath(componentPath: string): void {
  if (isNonRelativeComponentPath(componentPath)) {
    throw new CharacterTemplateError(`角色部件路径必须相对角色目录：${componentPath}`);
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(componentPath);
  } catch {
    throw new CharacterTemplateError(`角色部件路径包含非法编码：${componentPath}`);
  }
  // 解码后再检查，避免百分号编码隐藏绝对路径或目录回退段。
  if (isNonRelativeComponentPath(decodedPath)) {
    throw new CharacterTemplateError(`角色部件路径必须相对角色目录：${componentPath}`);
  }
  const pathSegments = decodedPath.replace(/\\/g, '/').split('/');
  if (pathSegments.includes('..')) {
    throw new CharacterTemplateError(`角色部件路径越出角色目录：${componentPath}`);
  }
  const resourcePath = decodedPath.split(/[?#]/, 1)[0];
  if (!/\.(?:png|webp|jpe?g)$/i.test(resourcePath)) {
    throw new CharacterTemplateError(`角色部件只支持静态 PNG、WebP 或 JPEG：${componentPath}`);
  }
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonRelativeComponentPath(componentPath: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(componentPath);
}

function hasOwn(record: object | undefined, key: string): boolean {
  return record !== undefined && Object.prototype.hasOwnProperty.call(record, key);
}
