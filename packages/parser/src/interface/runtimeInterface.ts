/**
 * 子场景结束后回到父场景的入口
 * @interface ISceneEntry
 */
export interface ISceneEntry {
  sceneName: string; // 场景名称
  sceneUrl: string; // 场景url
  continueLine: number; // 继续原场景的行号
}
