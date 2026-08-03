import {
  ICharacterComposition,
  ICharacterTemplate,
  resolveCharacterTemplateSelection,
  validateCharacterTemplate,
} from './characterTemplate';
import { assetSetter, fileType } from '@/Core/util/gameAssetsAccess/assetSetter';
import { composeCharacterImage } from './characterImageComposer';

export interface ICharacterFigureServiceDependencies {
  getTemplateUrl: (characterName: string) => string;
  loadTemplate: (templateUrl: string) => Promise<unknown>;
  compose: (
    composition: ICharacterComposition,
    context: { characterName: string; templateUrl: string },
  ) => Promise<string>;
  schedulePrewarm?: (task: () => void) => () => void;
}

export interface ICharacterFigureRequest {
  name: string;
  items: string[];
}

export class CharacterFigureService {
  // 模板与成功组合跟随当前游戏进程；失败任务会被移除，进行中任务只保留到 settle。
  private readonly templateTasks = new Map<string, Promise<ICharacterTemplate>>();
  private readonly compositionTasks = new Map<string, Promise<string>>();
  private readonly compositionResults = new Map<string, string>();
  private readonly scheduledPrewarms = new Map<string, () => void>();

  public constructor(private readonly dependencies: ICharacterFigureServiceDependencies) {}

  public async prepare(character: ICharacterFigureRequest): Promise<string> {
    const prewarmKey = getPrewarmKey(character);
    this.scheduledPrewarms.get(prewarmKey)?.();
    this.scheduledPrewarms.delete(prewarmKey);
    return this.prepareInternal(character);
  }

  public prewarm(character: ICharacterFigureRequest): void {
    const prewarmKey = getPrewarmKey(character);
    if (this.scheduledPrewarms.has(prewarmKey)) {
      return;
    }
    const schedule = this.dependencies.schedulePrewarm ?? scheduleDefaultPrewarm;
    const cancel = schedule(() => {
      this.scheduledPrewarms.delete(prewarmKey);
      void this.prepareInternal(character).catch(() => {
        // 预热失败不影响可见请求，后续可见请求会按正常失败重试规则重新准备。
      });
    });
    this.scheduledPrewarms.set(prewarmKey, cancel);
  }

  private async prepareInternal(character: ICharacterFigureRequest): Promise<string> {
    const templateUrl = this.dependencies.getTemplateUrl(character.name);
    const template = await this.getTemplate(templateUrl);
    let composition: ICharacterComposition;
    try {
      composition = resolveCharacterTemplateSelection(template, character.items);
    } catch (error) {
      // 作者修正同一路径下的模板后，下一次请求必须重新读取。
      this.templateTasks.delete(templateUrl);
      throw error;
    }
    const compositionKey = JSON.stringify([templateUrl, composition.layers.map((layer) => layer.name)]);
    const cachedResult = this.compositionResults.get(compositionKey);
    if (cachedResult) {
      return cachedResult;
    }
    const runningTask = this.compositionTasks.get(compositionKey);
    if (runningTask) {
      return runningTask;
    }

    const task = this.dependencies
      .compose(composition, { characterName: character.name, templateUrl })
      .then((sourceUrl) => {
        if (!sourceUrl) {
          throw new Error(`角色 ${character.name} 未生成有效图片`);
        }
        this.compositionResults.set(compositionKey, sourceUrl);
        return sourceUrl;
      })
      .catch((error) => {
        // 失败任务不进入缓存；同时允许作者修正模板中的资源路径后直接重试。
        this.templateTasks.delete(templateUrl);
        throw error;
      })
      .finally(() => {
        this.compositionTasks.delete(compositionKey);
      });
    this.compositionTasks.set(compositionKey, task);
    return task;
  }

  private getTemplate(templateUrl: string): Promise<ICharacterTemplate> {
    const cachedTask = this.templateTasks.get(templateUrl);
    if (cachedTask) {
      return cachedTask;
    }
    const task = this.dependencies
      .loadTemplate(templateUrl)
      .then((template) => {
        const candidate = template as ICharacterTemplate;
        validateCharacterTemplate(candidate);
        return candidate;
      })
      .catch((error) => {
        this.templateTasks.delete(templateUrl);
        throw error;
      });
    this.templateTasks.set(templateUrl, task);
    return task;
  }
}

function getPrewarmKey(character: ICharacterFigureRequest): string {
  return JSON.stringify([character.name, character.items]);
}

function scheduleDefaultPrewarm(task: () => void): () => void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task);
    return () => window.cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, 0);
  return () => clearTimeout(handle);
}

export function createDefaultCharacterFigureService(): CharacterFigureService {
  return new CharacterFigureService({
    getTemplateUrl: (characterName) => assetSetter(`${characterName}/figure.json`, fileType.figure),
    loadTemplate: async (templateUrl) => {
      const response = await fetch(templateUrl);
      if (!response.ok) {
        throw new Error(`无法读取角色模板 ${templateUrl}：HTTP ${response.status}`);
      }
      return response.json();
    },
    compose: (composition, context) => composeCharacterImage(composition, context.templateUrl),
  });
}

export const characterFigureService = createDefaultCharacterFigureService();
