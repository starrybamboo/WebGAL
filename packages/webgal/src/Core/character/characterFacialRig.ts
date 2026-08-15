import type {
  ICharacterFacialRig,
  ICharacterFacialRigRegion,
} from './characterTemplate';
import { resolveCharacterComponentUrl } from './characterImageComposer';

export interface IResolvedCharacterFacialRigEyes extends ICharacterFacialRigRegion {
  halfUrl?: string;
  closedUrl: string;
}

export interface IResolvedCharacterFacialRigMouth extends ICharacterFacialRigRegion {
  halfOpenUrl?: string;
  openUrl: string;
}

export interface IResolvedCharacterFacialRig {
  eyes?: IResolvedCharacterFacialRigEyes;
  mouth?: IResolvedCharacterFacialRigMouth;
}

export type IResolvedCharacterFacialRigRegion =
  | IResolvedCharacterFacialRigEyes
  | IResolvedCharacterFacialRigMouth;

/**
 * 把作者协议中的角色目录相对路径解析为 Pixi 可以直接加载的 URL。
 * 模板规则仍由 characterTemplate 负责，这里只跨越资源路径 seam。
 */
export function resolveCharacterFacialRigResources(
  facialRig: ICharacterFacialRig,
  templateUrl: string,
  resolveResourceUrl = resolveCharacterComponentUrl,
): IResolvedCharacterFacialRig {
  return {
    ...(facialRig.eyes
      ? {
          eyes: {
            x: facialRig.eyes.x,
            y: facialRig.eyes.y,
            width: facialRig.eyes.width,
            height: facialRig.eyes.height,
            closedUrl: resolveResourceUrl(facialRig.eyes.closed, templateUrl),
            ...(facialRig.eyes.half
              ? { halfUrl: resolveResourceUrl(facialRig.eyes.half, templateUrl) }
              : {}),
          },
        }
      : {}),
    ...(facialRig.mouth
      ? {
          mouth: {
            x: facialRig.mouth.x,
            y: facialRig.mouth.y,
            width: facialRig.mouth.width,
            height: facialRig.mouth.height,
            openUrl: resolveResourceUrl(facialRig.mouth.open, templateUrl),
            ...(facialRig.mouth.halfOpen
              ? { halfOpenUrl: resolveResourceUrl(facialRig.mouth.halfOpen, templateUrl) }
              : {}),
          },
        }
      : {}),
  };
}
