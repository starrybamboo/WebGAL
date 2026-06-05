export {};

declare global {
  interface Window {
    __TUANCHAT_WEBGAL__?: {
      autoStart?: boolean;
      startScene?: string;
      gameDir?: string;
    };
    __WEBGAL_DEVICE_INFO__?: {
      isIOS: boolean;
      isIOSPhone: boolean;
      isIPad: boolean;
    };
    electronFuncs?: {
      steam?: {
        initialize: (appId: string) => boolean | Promise<boolean>;
        unlockAchievement: (achievementId: string) => boolean | Promise<boolean>;
      };
    };
  }
}
