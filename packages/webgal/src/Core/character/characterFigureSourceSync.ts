import { CharacterFigureService } from './characterFigureService';
import type { ICharacterFigureTarget } from './characterFigureSource';
import type { IResolvedCharacterFacialRig } from './characterFacialRig';

export interface ICharacterFigureDelivery {
  key: string;
  sourceUrl: string;
  position: ICharacterFigureTarget['position'];
  facialRig?: IResolvedCharacterFacialRig;
}

export interface ICharacterFigureSourceAdapter {
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

export class CharacterFigureSourceSync {
  // 这里只保存运行时请求世代；可恢复来源始终以 Figure Target 为唯一事实源。
  private latestTargets = new Map<string, ICharacterFigureTarget>();
  private appliedSourceKeys = new Map<string, string>();
  private appliedPresentationKeys = new Map<string, string>();
  private pendingRequests = new Map<string, IPendingCharacterRequest>();
  private nextEpoch = 1;

  public constructor(
    private readonly figureService: CharacterFigureService,
    private readonly adapter: ICharacterFigureSourceAdapter,
  ) {}

  public sync(targets: ICharacterFigureTarget[]): void {
    const nextTargets = new Map(targets.map((target) => [target.key, target]));
    for (const key of this.latestTargets.keys()) {
      if (!nextTargets.has(key)) {
        this.adapter.removeFigure(key);
        this.appliedSourceKeys.delete(key);
        this.appliedPresentationKeys.delete(key);
        this.pendingRequests.delete(key);
      }
    }
    this.latestTargets = nextTargets;

    for (const target of targets) {
      const sourceKey = getCharacterSourceKey(target);
      const hasAppliedFigure = this.adapter.hasFigure?.(target.key) ?? true;
      const pendingRequest = this.pendingRequests.get(target.key);
      if (
        (this.appliedSourceKeys.get(target.key) === sourceKey && hasAppliedFigure) ||
        pendingRequest?.sourceKey === sourceKey
      ) {
        this.syncPresentation(target.key, hasAppliedFigure);
        continue;
      }
      // 每次新来源请求获得单调世代；只有仍匹配最新逻辑状态的世代可以写入 Pixi 舞台。
      const request = { epoch: this.nextEpoch++, sourceKey };
      this.pendingRequests.set(target.key, request);
      void this.figureService
        .prepareFigure(target.source)
        .then((preparedFigure) => this.applyPreparedFigure(target, request, preparedFigure))
        .catch((error) => {
          const isLatestRequest = this.pendingRequests.get(target.key)?.epoch === request.epoch;
          if (isLatestRequest) {
            this.pendingRequests.delete(target.key);
            this.adapter.reportError?.(`角色 ${target.source.name} 的组合图片准备失败`, error);
          }
        });
    }
  }

  private applyPreparedFigure(
    target: ICharacterFigureTarget,
    request: IPendingCharacterRequest,
    preparedFigure: Awaited<ReturnType<CharacterFigureService['prepareFigure']>>,
  ) {
    const latest = this.latestTargets.get(target.key);
    if (
      !latest ||
      getCharacterSourceKey(latest) !== request.sourceKey ||
      this.pendingRequests.get(target.key)?.epoch !== request.epoch
    ) {
      return;
    }
    this.adapter.replaceFigure({ key: target.key, position: target.position, ...preparedFigure });
    this.appliedSourceKeys.set(target.key, request.sourceKey);
    this.pendingRequests.delete(target.key);
    this.syncPresentation(target.key, true, true);
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

function getCharacterSourceKey(target: ICharacterFigureTarget): string {
  return JSON.stringify([target.source.name, target.source.items, target.position]);
}
