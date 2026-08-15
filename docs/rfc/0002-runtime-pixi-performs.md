# RFC 0002：按名称动态加载 Pixi 自定义特效

**状态：** 已实现（本分支，待上游评审）

**目标版本：** 待维护者确定

**相关实现：** `packages/webgal/src/Core/gameScripts/pixi/`、`packages/webgal/src/Core/util/pixiPerformManager/`

## 摘要

当剧本首次执行未注册的 `pixiPerform:<name>;` 时，引擎按约定加载游戏目录中的单个
JavaScript 文件：

```text
pixiPerform:weather/rain;
    -> game/pixi-performs/weather/rain.js
```

文件通过 `window.WebGALPixiPerform.register()` 注册到现有 `pixiPerformManager`。不需要
`index.js`、清单文件或特效专用构建步骤。安装一次支持该加载器的 WebGAL 后，新增或
修改特效只需编辑对应 `.js` 文件并刷新页面。

本方案以小型上游补丁为目标：不改 `PixiController`，不引入新的容器或 ticker 适配层。
运行时特效直接复用已有 `registerPerform`、`call` 和 `{ container, tickerKey }` 生命周期协议。
原默认雨、雪、大雪和樱花特效也以普通运行时脚本交付，作者可在游戏目录中直接调整参数。

## 背景

过去的默认特效会在引擎构建时被收集并调用 `registerPerform`。该注册表本身可在运行时写入，
但注册函数没有一个供游戏资源使用的受控入口，`pixi` 命令也会直接同步 `call(name)`。
因此，以往添加特效需要修改引擎源码并重新构建。

本 RFC 解决的是“游戏特效作者日后不需要重新编译引擎”。加载器本身仍需随 WebGAL
发布一次。

## 目标

- `pixiPerform:<name>;` 可按名称加载 `game/pixi-performs/<name>.js`。
- 新增或修改一个特效时，不需要更新入口、清单或重新构建 WebGAL。
- 已注册特效继续同步走现有 `call(name)` 链路。
- `rain`、`snow`、`heavySnow` 和 `cherryBlossoms` 作为默认模板运行时脚本交付。
- 加载期间暂停剧本推进，加载失败后解除阻塞并回收当前 perform。
- 限制名称到脚本的路径映射，拒绝覆盖任何已注册特效。
- 保持改动边界小，便于上游维护者审阅。

## 非目标

- 不支持运行时 TypeScript、JSX 或需要打包器解析的裸模块导入。
- 不实现当前页面内的热替换；修改已加载文件后需要刷新页面。
- 不建立 `RuntimeLayerContext`，不自动创建容器、代理 ticker 或提供 `asset/onTick/onDispose`。
- 不为特效代码提供沙箱；游戏包中的 JavaScript 是作者信任的页面代码。
- 不改变现有 generator 的错误回滚语义或为运行时特效建立第二套注册表。

## 名称与文件约定

特效名称必须匹配：

```text
[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*
```

名称中的 `/` 保留为目录分隔符，然后追加 `.js`。例如：

| 剧本                        | 加载的文件                           |
| --------------------------- | ------------------------------------ |
| `pixiPerform:spark;`        | `game/pixi-performs/spark.js`        |
| `pixiPerform:weather/rain;` | `game/pixi-performs/weather/rain.js` |

脚本 URL 以 `document.baseURI` 为基准，在无可用 base URI 时回退到 `window.location.href`。
名称规则不允许 `..`、反斜杠、扩展名、查询串或协议，因此剧本内容不能逃离
`game/pixi-performs/` 映射。

## 作者使用方式

游戏目录：

```text
game/
├─ pixi-performs/
│  └─ weather/
│     └─ rain.js
└─ tex/
   └─ rain.png
```

`game/pixi-performs/weather/rain.js`：

```js
(() => {
  let instanceId = 0;

  window.WebGALPixiPerform.register("weather/rain", {
    fg: () => {
      const PIXI = window.PIXI;
      const stage = window.PIXIapp; // 历史名称：该对象是 PixiStage，不是 PIXI.Application
      const container = new PIXI.Container();
      const sprite = PIXI.Sprite.from("./game/tex/rain.png");

      sprite.anchor.set(0.5);
      sprite.position.set(stage.stageWidth / 2, stage.stageHeight / 2);
      container.addChild(sprite);
      stage.foregroundEffectsContainer.addChild(container);

      const tickerKey = `runtime-weather-rain-${++instanceId}`;
      stage.registerAnimation(
        {
          setStartState: () => {},
          setEndState: () => {},
          tickerFunc: (delta) => {
            sprite.rotation += 0.01 * delta;
          },
        },
        tickerKey
      );
      stage.requestRender();

      return { container, tickerKey };
    },
  });
})();
```

剧本：

```text
pixiInit;
pixiPerform:weather/rain;
```

特效文件是浏览器可直接执行的经典脚本。它可以使用自己的函数和闭包，但不能使用需要
打包的 `import`。每个 generator 必须同步：

1. 创建容器并将它加入对应的前景或背景特效层。
2. 如果需要动画，使用每个实例唯一的 `tickerKey` 调用现有 `stage.registerAnimation()`。
3. 返回 `{ container, tickerKey }`。

引擎的现有 `pixi` 卸载链路会按返回值销毁容器、从对应图层移除容器，并通过
`tickerKey` 移除动画。

## 运行时注册接口

```ts
interface WebGALPixiPerformRuntime {
  readonly version: 1;
  register(name: string, definition: RuntimePerformDefinition): void;
}

interface RuntimePerformDefinition {
  fg?: () => { container: PIXI.Container; tickerKey: string };
  bg?: () => { container: PIXI.Container; tickerKey: string };
}
```

`register()` 只是受控地转发到现有 `registerPerform()`，并增加三条运行时边界：

- 只能在引擎创建的经典 `<script>` 同步执行期间注册。
- 注册名必须与当前 `document.currentScript.dataset` 中的请求名完全一致。
- 不允许覆盖内置特效或任何已注册特效。

definition 的其余校验与 generator 返回值校验仍由现有 `registerPerform()` 和 `call()` 完成。

## 加载与执行流程

1. `pixi.startFunction` 先用 `hasPerform(name)` 查询现有注册表。
2. 已注册名立即同步调用现有 `call(name)`，注册表执行链路不变。
3. 未注册名进入 `ensureRuntimePerformLoaded(name)`，安装全局注册接口并创建一个带有
   预期名称的 `<script async src="...">`。
4. 同一名称正在进行的请求共享一个 Promise。请求完成后从去重 Map 移除，注册表是
   唯一事实来源；如果特效日后被注销，同名请求可以再次加载。
5. `load` 事件后确认目标名已注册，然后调用现有 `call(name)`。
6. 加载期间 `blockingNext()` 和 `blockingAuto()` 返回 `true`。成功或失败后解除阻塞。
7. 脚本失败、超时、未注册目标名，或首次异步挂载时 generator 抛错，会记录错误并调用
   `softUnmountPerformObject(perform)`。
8. 如果 perform 在加载完成前已停止，异步回调不再调用 generator，避免向旧场景迟到挂载。

加载超时为 10 秒。失败请求不会留在去重 Map 中，修正文件后可再次尝试。

## 最小改动边界

| 位置                                  | 改动                                                       |
| ------------------------------------- | ---------------------------------------------------------- |
| `pixiPerformManager.ts`               | 只新增 `hasPerform(name)` 查询，不改注册、调用和返回值协议 |
| `runtimePixiPerformLoader.ts`         | 新增独立脚本加载器和受控注册入口                           |
| `pixi/index.ts`                       | 只在名称未注册时走异步后备，保留原容器/ticker 卸载代码     |
| `electron.d.ts`                       | 为新全局注册入口增加类型声明                               |
| `public/game/pixi-performs/*.js`      | 交付四个可直接编辑的默认特效                               |
| `public/game/tex/effects/`            | 交付默认特效的三份纹理                                     |
| `src/Core/gameScripts/pixi/performs/` | 移除对应的编译时默认实现                                   |

本实现不修改 `PixiController`、剧本语法或 Terre 的游戏目录复制逻辑；四个默认命令名和原始参数保持不变。

## 兼容性与明确限制

- 不使用运行时特效或这四个默认名的游戏不受影响。
- 现有 `pixiPerform:<name>;` 语法不变，名称中的 `/` 用于运行时特效子目录。
- 默认模板中的雨、雪、大雪和樱花命令名不变，首次使用时会加载对应 `.js` 文件。
- 在此功能之前创建的旧游戏如果单独升级引擎，需要同步复制默认模板的
  `game/pixi-performs/` 和 `game/tex/effects/` 目录，才能继续使用这四个默认名。
- 作者仍需先执行 `pixiInit;`，以便 `window.PIXIapp` 指向已初始化的 PixiStage。
- 运行时特效复用当前 `ILayerResult` 生命周期和错误语义。generator 如果已产生副作用后
  抛错，引擎因尚未拿到 `{ container, tickerKey }` 而无法保证回滚；作者应先完成可失败的准备，
  再挂载容器和 ticker。
- 首次动态加载的 generator 异常会被异步链路回收 perform；已注册特效后续的同步调用则
  保持内置特效原有异常语义。修正特效代码后应刷新页面。
- `setEndState` 会在现有卸载链路销毁容器之后执行，不应访问已销毁的容器。

## 安全边界

运行时特效是可信游戏代码，不是沙箱插件。加载器只限制“剧本名称如何映射到特效脚本”；
脚本执行后仍拥有当前页面允许的浏览器能力，也可以自行请求资源。不应从不可信来源安装
游戏包。

加载器本身不使用 `eval` 或内联字符串，只创建带 `src` 的经典 `<script>`，并校验名称、
当前脚本和覆盖冲突。Electron 环境仍遵循现有 preload 和 CSP 边界。

## Terre 与导出

特效文件位于普通 `game/` 目录。Terre 的预览和导出应像其他游戏资源一样复制
`game/pixi-performs/**/*.js`，不应生成 `index.js` 或编译特效。本功能的引擎代码仍需通过一次
WebGAL 构建发布，但游戏作者后续编辑特效文件不再需要构建引擎。默认模板直接包含
`rain.js`、`snow.js`、`heavySnow.js`、`cherryBlossoms.js` 及对应纹理。

## 验收标准

- 只新增 `game/pixi-performs/spark.js` 后，`pixiPerform:spark;` 能加载并调用它。
- 已注册特效不创建 `<script>`，仍同步执行。
- 四个默认特效由默认游戏目录动态加载，引擎编译目录不再注册它们。
- 同名并发加载只创建一个请求；成功、失败或注销后的重试不被过期 Promise 卡住。
- 名称非法、脚本失败或超时、未注册目标名、名称不匹配和覆盖尝试都会失败。
- 加载期间阻塞剧本推进；失败后解除阻塞并回收 perform。
- 加载完成前停止 perform 时，不会在旧场景中迟到调用 generator。
- 前景层、背景层、容器销毁和 ticker 移除继续走原有卸载链路。
- 定向测试、TypeScript 检查、覆盖率门槛和 `yarn webgal:build` 通过，并用 Terre
  `yarn update-engine` 同步预览模板。

## 结论

采用“名称到文件 + 复用现有注册协议”的最小方案。这个补丁只为未知特效增加后备加载，
不重构 WebGAL 的 Pixi 层。引擎随版本更新一次后，每个自定义特效都可以作为独立
`game/pixi-performs/<name>.js` 文件直接新增或修改；默认雨、雪、大雪和樱花特效也使用同一交付方式。
