/** 眨眼参数，毫秒 */
export interface BlinkParam {
  blinkInterval: number; // 眨眼间隔
  blinkIntervalRandom: number; // 眨眼间隔随机范围
  closingDuration: number; // 闭眼
  closedDuration: number; // 保持闭眼
  openingDuration: number; // 睁眼
}

export const baseBlinkParam: BlinkParam = {
  blinkInterval: 24 * 60 * 60 * 1000, // 24小时
  blinkIntervalRandom: 1000,
  closingDuration: 100,
  closedDuration: 50,
  openingDuration: 150,
};

export interface FocusParam {
  x: number; // 焦点X位置
  y: number; // 焦点Y位置
  instant: boolean; // 是否瞬间切换焦点
}

export const baseFocusParam: FocusParam = {
  x: 0,
  y: 0,
  instant: false,
};

export class Live2DCore {
  public isAvailable = false;

  public Live2DModel: any;
  public SoundManager: any;
  public Config: any;

  public constructor() {
    this.initLive2D();
  }

  public initLive2D() {
    // @ts-expect-error live2dPromise is a global variable
    (window.live2dPromise as Promise<[boolean, boolean]>)
      .then(async ([live2d2dAvailable, live2d4Available]) => {
        const _isAvailable = live2d2dAvailable && live2d4Available;
        if (!_isAvailable) {
          console.warn('live2d plugin load failed');
          return;
        }
        const { Live2DModel, SoundManager, config } = await import('pixi-live2d-display-webgal');
        this.Live2DModel = Live2DModel;
        this.SoundManager = SoundManager;
        this.Config = config;
        this.isAvailable = true;
        console.log('Live2D plugin load success');
      })
      .catch((error) => {
        this.isAvailable = false;
        console.warn('Live2D plugin load failed', error);
      })
      .finally(() => {
        // @ts-expect-error live2dPromise is a global variable
        delete window.live2dPromise;
      });
  }

}
