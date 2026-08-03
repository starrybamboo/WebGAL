import { arg, commandType, IAsset } from '../interface/sceneInterface';
import { fileType } from '../interface/assets';

type AssetSetter = (fileName: string, assetType: fileType) => string;

/**
 * 根据语句类型、语句内容、参数列表，扫描该语句可能携带的资源
 * @param command 语句类型
 * @param content 语句内容
 * @param args 参数列表
 * @return {Array<IAsset>} 语句携带的参数列表
 */
export const assetsScanner = (
  command: commandType,
  content: string,
  args: Array<arg>,
  lineNumber: number,
  assetSetter?: AssetSetter,
): Array<IAsset> => {
  let hasVocalArg = false;
  const returnAssetsList: Array<IAsset> = [];
  if (command === commandType.say) {
    args.forEach((e) => {
      if (e.key === 'vocal') {
        hasVocalArg = true;
        returnAssetsList.push({
          name: e.value as string,
          url: e.value as string,
          lineNumber,
          type: fileType.vocal,
        });
      }
    });
  }
  if (command === commandType.tuanChatMap) {
    returnAssetsList.push(...scanTuanChatMapAssets(args, lineNumber, assetSetter));
  }
  if (content === 'none' || content === '') {
    return returnAssetsList;
  }
  // 处理语句携带的资源
  if (command === commandType.changeBg) {
    returnAssetsList.push({
      name: content,
      url: content,
      lineNumber,
      type: fileType.background,
    });
  }
  if (command === commandType.changeFigure) {
    returnAssetsList.push({
      name: content,
      url: content,
      lineNumber,
      type: fileType.figure,
    });
  }
  if (command === commandType.miniAvatar) {
    returnAssetsList.push({
      name: content,
      url: content,
      lineNumber,
      type: fileType.figure,
    });
  }
  if (command === commandType.video) {
    returnAssetsList.push({
      name: content,
      url: content,
      lineNumber,
      type: fileType.video,
    });
  }
  if (command === commandType.bgm) {
    returnAssetsList.push({
      name: content,
      url: content,
      lineNumber,
      type: fileType.bgm,
    });
  }
  return returnAssetsList;
};


function scanTuanChatMapAssets(args: Array<arg>, lineNumber: number, assetSetter?: AssetSetter): Array<IAsset> {
  const assets: Array<IAsset> = [];
  const background = getStringArg(args, 'background');
  if (background) {
    assets.push({
      name: background,
      url: resolveTypedAssetUrl(background, fileType.background, assetSetter),
      lineNumber,
      type: fileType.background,
    });
  }
  const avatar = getStringArg(args, 'avatar');
  if (avatar) {
    assets.push({
      name: avatar,
      url: resolveTypedAssetUrl(avatar, fileType.figure, assetSetter),
      lineNumber,
      type: fileType.figure,
    });
  }
  return assets;
}

function getStringArg(args: Array<arg>, key: string): string {
  const value = args.find((argItem) => argItem.key === key)?.value;
  return typeof value === 'string' ? value.trim() : '';
}

function resolveTypedAssetUrl(value: string, type: fileType, assetSetter?: AssetSetter): string {
  if (!assetSetter || value.match(/^(https?:|data:|blob:|\.\/|\/)/)) {
    return value;
  }
  return assetSetter(value, type);
}
