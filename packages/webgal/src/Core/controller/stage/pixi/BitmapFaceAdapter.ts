import type {
  IResolvedCharacterFacialRig,
  IResolvedCharacterFacialRigRegion,
} from '@/Core/character/characterFacialRig';
import type { FaceAdapter, FaceChannels, FacePose } from '@/Core/figure/figureFaceRuntime';
import { quantizeMouthOpenness, type BitmapMouthState } from '@/Core/figure/speechSignal';

export interface IBitmapFaceLayout {
  sourceWidth: number;
  sourceHeight: number;
  scale: number;
  centerY: number;
}

export interface IBitmapFaceLayerHandle<TTexture> {
  setTexture: (texture: TTexture) => void;
  setVisible: (visible: boolean) => void;
}

export interface IBitmapFaceAdapterDependencies<TTexture> {
  loadTexture: (url: string) => Promise<TTexture>;
  attachLayer: (
    layer: 'eyes' | 'mouth',
    texture: TTexture,
    region: IResolvedCharacterFacialRigRegion,
    layout: IBitmapFaceLayout,
  ) => IBitmapFaceLayerHandle<TTexture>;
  requestRender: () => void;
  reportError: (message: string, error: unknown) => void;
}

interface EyeTextures<TTexture> {
  half?: TTexture;
  closed: TTexture;
}

interface MouthTextures<TTexture> {
  half?: TTexture;
  open: TTexture;
}

/** Pure bitmap presentation adapter. It owns resources and overlays, not time. */
export class BitmapFaceAdapter<TTexture> implements FaceAdapter {
  public readonly channels: FaceChannels;
  public readonly ready: Promise<void>;
  private eyeTextures: EyeTextures<TTexture> | undefined;
  private mouthTextures: MouthTextures<TTexture> | undefined;
  private eyesHandle: IBitmapFaceLayerHandle<TTexture> | undefined;
  private mouthHandle: IBitmapFaceLayerHandle<TTexture> | undefined;
  private latestPose: FacePose = {};
  private hasPresentedPose = false;
  private mouthState: BitmapMouthState = 'closed';
  private appliedEyeState: 'open' | 'half' | 'closed' | undefined;
  private appliedMouthState: BitmapMouthState | undefined;
  private disposed = false;

  public constructor(
    private readonly facialRig: IResolvedCharacterFacialRig,
    layout: IBitmapFaceLayout,
    private readonly dependencies: IBitmapFaceAdapterDependencies<TTexture>,
  ) {
    this.channels = { eyes: !!facialRig.eyes, mouth: !!facialRig.mouth };
    this.ready = Promise.all([this.loadEyes(layout), this.loadMouth(layout)]).then(() => undefined);
  }

  public present(pose: FacePose): void {
    if (this.disposed) return;
    this.latestPose = pose;
    this.hasPresentedPose = true;
    const eyesChanged = this.applyEyes();
    const mouthChanged = this.applyMouth();
    const changed = eyesChanged || mouthChanged;
    if (changed) this.dependencies.requestRender();
  }

  public release(): void {
    this.eyesHandle?.setVisible(false);
    this.mouthHandle?.setVisible(false);
    if (this.eyesHandle || this.mouthHandle) this.dependencies.requestRender();
    this.disposed = true;
    this.eyesHandle = undefined;
    this.mouthHandle = undefined;
  }

  private async loadEyes(layout: IBitmapFaceLayout): Promise<void> {
    const eyes = this.facialRig.eyes;
    if (!eyes) return;
    try {
      const [closed, half] = await Promise.all([
        this.dependencies.loadTexture(eyes.closedUrl),
        eyes.halfUrl
          ? this.loadOptionalTexture(eyes.halfUrl, '分层立绘的半闭眼纹理加载失败，改用闭眼纹理')
          : Promise.resolve(undefined),
      ]);
      if (this.disposed) return;
      this.eyeTextures = { closed, ...(half ? { half } : {}) };
      this.eyesHandle = this.dependencies.attachLayer('eyes', half ?? closed, eyes, layout);
      this.eyesHandle.setVisible(false);
      if (this.hasPresentedPose && this.applyEyes()) this.dependencies.requestRender();
    } catch (error) {
      if (!this.disposed) this.dependencies.reportError('分层立绘的眼睛纹理加载失败，保留底图睁眼状态', error);
    }
  }

  private async loadMouth(layout: IBitmapFaceLayout): Promise<void> {
    const mouth = this.facialRig.mouth;
    if (!mouth) return;
    try {
      const [open, half] = await Promise.all([
        this.dependencies.loadTexture(mouth.openUrl),
        mouth.halfOpenUrl
          ? this.loadOptionalTexture(mouth.halfOpenUrl, '分层立绘的半开嘴纹理加载失败，改用全开嘴纹理')
          : Promise.resolve(undefined),
      ]);
      if (this.disposed) return;
      this.mouthTextures = { open, ...(half ? { half } : {}) };
      this.mouthHandle = this.dependencies.attachLayer('mouth', half ?? open, mouth, layout);
      this.mouthHandle.setVisible(false);
      if (this.hasPresentedPose && this.applyMouth()) this.dependencies.requestRender();
    } catch (error) {
      if (!this.disposed) this.dependencies.reportError('分层立绘的嘴型纹理加载失败，保留底图闭嘴状态', error);
    }
  }

  private async loadOptionalTexture(url: string, message: string): Promise<TTexture | undefined> {
    try {
      return await this.dependencies.loadTexture(url);
    } catch (error) {
      if (!this.disposed) this.dependencies.reportError(message, error);
      return undefined;
    }
  }

  private applyEyes(): boolean {
    const handle = this.eyesHandle;
    const textures = this.eyeTextures;
    if (!handle || !textures) return false;
    const state =
      this.latestPose.eyeOpen === undefined || this.latestPose.eyeOpen >= 0.75
        ? 'open'
        : this.latestPose.eyeOpen >= 0.25
          ? 'half'
          : 'closed';
    if (state === this.appliedEyeState) return false;
    this.appliedEyeState = state;
    if (state === 'open') {
      handle.setVisible(false);
    } else {
      handle.setTexture(state === 'half' ? textures.half ?? textures.closed : textures.closed);
      handle.setVisible(true);
    }
    return true;
  }

  private applyMouth(): boolean {
    const handle = this.mouthHandle;
    const textures = this.mouthTextures;
    if (!handle || !textures) return false;
    const requestedOpen = this.latestPose.mouthOpen ?? 0;
    const quantized = quantizeMouthOpenness(requestedOpen, this.mouthState);
    this.mouthState = quantized.state;
    const shouldResubmitTransition =
      (quantized.state === 'half_open' && requestedOpen >= 0.68) ||
      (quantized.state === 'half_open' && requestedOpen <= 0.32);
    if (quantized.state === this.appliedMouthState && !shouldResubmitTransition) return false;
    this.appliedMouthState = quantized.state;
    if (quantized.state === 'closed') {
      handle.setVisible(false);
    } else {
      handle.setTexture(quantized.state === 'half_open' ? textures.half ?? textures.open : textures.open);
      handle.setVisible(true);
    }
    return true;
  }
}
