const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
const distDir = path.join(packageRoot, 'dist');
const assetsDir = path.join(distDir, 'assets');
const engineDir = path.join(distDir, 'engine');

const sharedEngineMode =
  process.env.WEBGAL_BUILD_TARGET === 'shared-engine' || process.env.npm_lifecycle_event === 'build:shared-engine';
if (!sharedEngineMode) {
  process.exit(0);
}

const fontCdnBase =
  process.env.WEBGAL_FONT_CDN_BASE?.trim() ||
  'https://cdn.jsdelivr.net/gh/OpenWebGAL/WebGAL@main/packages/webgal/src/assets/fonts';

const fontExternalUrls = new Map([
  ['ResourceHanRoundedCN-Regular', `${fontCdnBase}/ResourceHanRoundedCN-Regular.ttf`],
  ['SourceHanSerifCN-Regular', `${fontCdnBase}/SourceHanSerifCN-Regular.ttf`],
  ['OPPOSans-R', `${fontCdnBase}/OPPOSans-R.ttf`],
]);

ensureDirectory(engineDir);

const assetNames = fs.readdirSync(assetsDir);
const cssFiles = assetNames.filter((name) => name.endsWith('.css')).sort();
const mainJsFile = assetNames.find((name) => /^index-[^.]+\.js$/.test(name));

if (!mainJsFile) {
  throw new Error('无法在 dist/assets 中找到主入口 JS 文件。');
}

rewriteSharedCss(fontExternalUrls);
removeGameDirectory(distDir);
removeCompressedArtifacts(distDir);
removeBundledFontAssets(assetsDir, fontExternalUrls);
writeLoaderScript(engineDir, cssFiles, mainJsFile);

function ensureDirectory(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function removeCompressedArtifacts(rootDir) {
  for (const entry of walkFiles(rootDir)) {
    if (entry.endsWith('.gz')) {
      fs.rmSync(entry, { force: true });
    }
  }
}

function removeGameDirectory(rootDir) {
  fs.rmSync(path.join(rootDir, 'game'), { recursive: true, force: true });
}

function removeBundledFontAssets(targetAssetsDir, externalUrls) {
  const assetFiles = fs.readdirSync(targetAssetsDir);
  for (const fileName of assetFiles) {
    if (!fileName.endsWith('.ttf')) {
      continue;
    }

    const fontKey = resolveFontKey(fileName);
    if (!fontKey || !externalUrls.has(fontKey)) {
      continue;
    }

    fs.rmSync(path.join(targetAssetsDir, fileName), { force: true });
  }
}

function rewriteSharedCss(externalUrls) {
  for (const cssFile of fs.readdirSync(assetsDir)) {
    if (!cssFile.endsWith('.css')) {
      continue;
    }

    const cssPath = path.join(assetsDir, cssFile);
    let css = fs.readFileSync(cssPath, 'utf8');
    let changed = false;

    for (const [fontKey, remoteUrl] of externalUrls) {
      const assetFileName = findBundledFontFileName(fontKey);
      if (!assetFileName) {
        continue;
      }

      const fontPattern = new RegExp(`url\\((['"]?)\\.?/?${escapeRegExp(assetFileName)}\\1\\)`, 'g');
      if (fontPattern.test(css)) {
        css = css.replace(fontPattern, `url("${remoteUrl}")`);
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(cssPath, css, 'utf8');
    }
  }
}

function writeLoaderScript(targetDir, cssFilesList, mainJsFileName) {
  const cssImportList = cssFilesList.map((fileName) => JSON.stringify(fileName)).join(', ');
  const loader = `(() => {
  const assetBase = new URL('../assets/', import.meta.url);
  const cssFiles = [${cssImportList}];
  const mainScript = ${JSON.stringify(mainJsFileName)};

  const shellStyles = \`
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #000;
    }
    #root,
    #ebg,
    #html-body__panic-overlay {
      position: absolute;
      inset: 0;
    }
    .html-body__effect-background {
      height: 1440px;
      width: 2560px;
      filter: blur(50px);
      background-position: center;
      background-repeat: no-repeat;
      background-size: cover;
      position: absolute;
      top: 0;
      left: 0;
      background-color: black;
      transform-origin: top left;
    }
    .html-body__effect-background-overlay {
      height: 100%;
      width: 100%;
      background-position: center;
      background-repeat: no-repeat;
      background-size: cover;
      position: absolute;
      top: 0;
      left: 0;
      background-color: black;
      opacity: 0;
    }
  \`;

  const ensureDeviceInfo = () => {
    const userAgent = navigator.userAgent || '';
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    const isIOSPhone = /iPhone|iPod/i.test(userAgent);
    const isIPad = /iPad/i.test(userAgent) || (/Mac/i.test(platform) && maxTouchPoints > 1);

    window.__WEBGAL_DEVICE_INFO__ = {
      isIOS: isIOSPhone || isIPad,
      isIOSPhone,
      isIPad,
    };
  };

  const ensureShell = () => {
    document.documentElement.style.width = '100%';
    document.documentElement.style.height = '100%';

    const body = document.body || document.documentElement.appendChild(document.createElement('body'));
    body.innerHTML = [
      '<style>' + shellStyles + '</style>',
      '<div id="ebg" class="html-body__effect-background"><div id="ebgOverlay" class="html-body__effect-background-overlay"></div></div>',
      '<div id="html-body__panic-overlay"></div>',
      '<div id="root"></div>',
    ].join('');
  };

  const loadStyle = (url) => new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.crossOrigin = '';
    link.href = url;
    link.onload = () => resolve(url);
    link.onerror = () => reject(new Error(\`Failed to load stylesheet: \${url}\`));
    document.head.appendChild(link);
  });

  const fitStage = () => {
    const root = document.getElementById('root');
    const bg = document.getElementById('ebg');
    if (!root) {
      return;
    }

    const targetWidth = 2560;
    const targetHeight = 1440;
    const scale = Math.min(window.innerWidth / targetWidth, window.innerHeight / targetHeight);
    const translateX = (window.innerWidth - targetWidth * scale) / 2;
    const translateY = (window.innerHeight - targetHeight * scale) / 2;
    const transform = \`translate(\${translateX}px, \${translateY}px) scale(\${scale})\`;

    root.style.width = \`\${targetWidth}px\`;
    root.style.height = \`\${targetHeight}px\`;
    root.style.transformOrigin = 'top left';
    root.style.transform = transform;

    if (bg) {
      bg.style.transformOrigin = 'top left';
      bg.style.transform = transform;
    }
  };

  const bootstrap = async () => {
    ensureDeviceInfo();
    ensureShell();

    const viewportMeta = document.querySelector('meta[name="viewport"]') || document.createElement('meta');
    viewportMeta.setAttribute('name', 'viewport');
    viewportMeta.setAttribute('content', 'width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no');
    if (!viewportMeta.parentNode) {
      document.head.appendChild(viewportMeta);
    }

    window.live2dPromise = Promise.resolve([false, false]);
    await Promise.all(cssFiles.map((fileName) => loadStyle(new URL(fileName, assetBase).href)));
    fitStage();
    window.addEventListener('resize', fitStage);
    await import(new URL(mainScript, assetBase).href);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void bootstrap();
    }, { once: true });
  } else {
    void bootstrap();
  }
})();\n`;

  fs.writeFileSync(path.join(targetDir, 'loader.js'), loader, 'utf8');
}

function resolveFontKey(fileName) {
  if (fileName.startsWith('ResourceHanRoundedCN-Regular-')) {
    return 'ResourceHanRoundedCN-Regular';
  }
  if (fileName.startsWith('SourceHanSerifCN-Regular-')) {
    return 'SourceHanSerifCN-Regular';
  }
  if (fileName.startsWith('OPPOSans-R-')) {
    return 'OPPOSans-R';
  }
  return null;
}

function findBundledFontFileName(fontKey) {
  for (const fileName of fs.readdirSync(assetsDir)) {
    if (fileName.startsWith(fontKey) && fileName.endsWith('.ttf')) {
      return fileName;
    }
  }
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function* walkFiles(rootDir) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
      continue;
    }
    yield fullPath;
  }
}
