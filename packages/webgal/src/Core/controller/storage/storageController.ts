import * as localforage from 'localforage';
import { IUserData } from '@/store/userDataInterface';
import { logger } from '../../util/logger';
import { webgalStore } from '@/store/store';
import { resetUserData } from '@/store/userDataReducer';

import { WebGAL } from '@/Core/WebGAL';

/**
 * 写入本地存储
 */
export const setStorage = debounce(() => {
  const userDataState = webgalStore.getState().userData;
  localforage.setItem(WebGAL.gameKey, userDataState).then(() => {
    logger.info('写入本地存储');
  });
}, 100);

/**
 * 从本地存储获取数据
 */
export const getStorage = debounce(() => {
  localforage.getItem(WebGAL.gameKey).then((newUserData) => {
    // 如果没有数据，重新初始化
    if (!newUserData) {
      logger.warn('现在重置数据');
      setStorage();
      return;
    }
    webgalStore.dispatch(resetUserData(newUserData as IUserData));
  });
}, 100);

/**
 * 防抖函数
 * @param func 要执行的函数
 * @param wait 防抖等待时间
 */
function debounce<T, K>(func: (...args: T[]) => K, wait: number) {
  let timeout: ReturnType<typeof setTimeout>;

  function context(...args: T[]): K {
    clearTimeout(timeout);
    let ret!: K;
    timeout = setTimeout(() => {
      ret = func.apply(context, args);
    }, wait);
    return ret;
  }

  return context;
}

export const dumpToStorageFast = () => {
  const userDataState = webgalStore.getState().userData;
  localforage.setItem(WebGAL.gameKey, userDataState).then(() => {
    localforage.getItem(WebGAL.gameKey).then((newUserData) => {
      // 如果没有数据，初始化
      if (!newUserData) {
      setStorage();
      return;
    }
      webgalStore.dispatch(resetUserData(newUserData as IUserData));
    });
    logger.info('同步本地存储');
  });
};

export async function setStorageAsync() {
  const userDataState = webgalStore.getState().userData;
  return await localforage.setItem(WebGAL.gameKey, userDataState);
}

export async function getStorageAsync() {
  const newUserData = await localforage.getItem(WebGAL.gameKey);
  if (!newUserData) {
    const userDataState = webgalStore.getState().userData;
    logger.warn('现在重置数据');
    return await localforage.setItem(WebGAL.gameKey, userDataState);
  }
  webgalStore.dispatch(resetUserData(newUserData as IUserData));
  return;
}
