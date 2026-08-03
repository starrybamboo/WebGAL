import { IStageCharacter } from '@/Core/Modules/stage/stageInterface';
import { CharacterFigureService } from './characterFigureService';

export interface ICharacterFigureDelivery {
  key: string;
  sourceUrl: string;
  position: IStageCharacter['position'];
}

export interface ICharacterStageAdapter {
  replaceFigure: (figure: ICharacterFigureDelivery) => void;
  removeFigure: (key: string) => void;
  hasFigure?: (key: string) => boolean;
  getPresentationKey?: (key: string) => string;
  applyPresentation?: (key: string) => void;
  reportError?: (message: string, error: unknown) => void;
}

interface IPendingCharacterRequest {
  epoch: number;
  sourceKey: string;
}

export class CharacterStageSync {
  // 逻辑状态、已交付来源与当前请求分开记录，避免异步图片完成顺序反转舞台状态。
  private latestCharacters = new Map<string, IStageCharacter>();
  private appliedSourceKeys = new Map<string, string>();
  private appliedPresentationKeys = new Map<string, string>();
  private pendingRequests = new Map<string, IPendingCharacterRequest>();
  private nextEpoch = 1;

  public constructor(
    private readonly figureService: CharacterFigureService,
    private readonly adapter: ICharacterStageAdapter,
  ) {}

  public sync(characters: IStageCharacter[]): void {
    const nextCharacters = new Map(characters.map((character) => [character.key, character]));
    for (const key of this.latestCharacters.keys()) {
      if (!nextCharacters.has(key)) {
        this.adapter.removeFigure(key);
        this.appliedSourceKeys.delete(key);
        this.appliedPresentationKeys.delete(key);
        this.pendingRequests.delete(key);
      }
    }
    this.latestCharacters = nextCharacters;

    for (const character of characters) {
      const sourceKey = getCharacterSourceKey(character);
      const hasAppliedFigure = this.adapter.hasFigure?.(character.key) ?? true;
      const pendingRequest = this.pendingRequests.get(character.key);
      if (
        (this.appliedSourceKeys.get(character.key) === sourceKey && hasAppliedFigure) ||
        pendingRequest?.sourceKey === sourceKey
      ) {
        this.syncPresentation(character.key, hasAppliedFigure);
        continue;
      }
      // 每次新来源请求获得单调世代；只有仍匹配最新逻辑状态的世代可以写入 Pixi 舞台。
      const request = { epoch: this.nextEpoch++, sourceKey };
      this.pendingRequests.set(character.key, request);
      void this.figureService
        .prepare(character)
        .then((sourceUrl) => this.applyPreparedFigure(character, request, sourceUrl))
        .catch((error) => {
          const isLatestRequest = this.pendingRequests.get(character.key)?.epoch === request.epoch;
          if (isLatestRequest) {
            this.pendingRequests.delete(character.key);
            this.adapter.reportError?.(`角色 ${character.name} 的组合图片准备失败`, error);
          }
        });
    }
  }

  private applyPreparedFigure(character: IStageCharacter, request: IPendingCharacterRequest, sourceUrl: string) {
    const latest = this.latestCharacters.get(character.key);
    if (
      !latest ||
      getCharacterSourceKey(latest) !== request.sourceKey ||
      this.pendingRequests.get(character.key)?.epoch !== request.epoch
    ) {
      return;
    }
    this.adapter.replaceFigure({ key: character.key, sourceUrl, position: character.position });
    this.appliedSourceKeys.set(character.key, request.sourceKey);
    this.pendingRequests.delete(character.key);
    this.syncPresentation(character.key, true, true);
  }

  private syncPresentation(key: string, hasFigure: boolean, force = false) {
    if (!hasFigure || !this.adapter.getPresentationKey || !this.adapter.applyPresentation) {
      return;
    }
    const presentationKey = this.adapter.getPresentationKey(key);
    if (!force && this.appliedPresentationKeys.get(key) === presentationKey) {
      return;
    }
    this.adapter.applyPresentation(key);
    this.appliedPresentationKeys.set(key, presentationKey);
  }
}

function getCharacterSourceKey(character: IStageCharacter): string {
  return JSON.stringify([character.name, character.items, character.position]);
}
