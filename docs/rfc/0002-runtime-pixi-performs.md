# RFC 0002：按名称动态加载 Pixi 自定义特效

**状态：** 草案，待实现
**目标版本：** 下一主版本（待定）
**相关实现：** `packages/webgal/src/Core/gameScripts/pixi/`、`packages/webgal/src/Core/util/pixiPerformManager/`

## 摘要

本 RFC 为 WebGAL 增加运行时 Pixi 特效加载能力。剧本首次执行未知的
`pixiPerform:<name>;` 时，引擎按约定加载游戏目录中的单个 JavaScript 文件：

```text
pixiPerform:spark;
    -> game/pixi-performs/spark.js
```

特效文件通过稳定的 `window.WebGALPixiPerform` 接口注册，不需要 `index.js`、特效清单或
重新编译引擎。修改已有特效只修改对应文件，新增特效只新增对应文件。

引擎仍然保留当前构建期自动注册的内置特效。运行时加载只作为未找到内置特效时的后备路径，
因此现有游戏和现有 `pixiPerform` 语法保持兼容。

## 背景与问题

当前内置特效通过 `import.meta.glob` 在构建期收集：

```ts
import.meta.glob('../../gameScripts/pixi/performs/*.{ts,js,tsx,jsx}', { eager: true });
```

注册表 `registerPerform` 运行时只向内存 `Map` 写入回调，但该注册函数没有暴露给游戏资源。
`pixi` 命令的 `startFunction` 也同步调用 `call(sentence.content)`，所以游戏目录中的新文件
无法在不改引擎源码的情况下参与注册。

本 RFC 要解决的是“特效作者不需要重新编译引擎”，不是“引擎永远不需要构建”。运行时加载器
本身需要随引擎发布一次；安装包含该加载器的引擎后，特效文件的后续修改不再触发引擎构建。

## 目标

- `pixiPerform:<name>;` 可以按名称加载 `game/pixi-performs/<name>.js`。
- 修改或新增单个特效不需要更新入口文件、清单文件或重新编译引擎。
- 内置 `snow`、`rain` 等特效保持当前同步调用和生命周期。
- 运行时特效仍由引擎统一创建容器、管理 ticker、请求渲染和清理资源。
- Web 预览、Web 导出、Electron 导出和 Android 导出都携带游戏目录中的特效文件。
- 文件路径、特效名称和注册对象都有明确校验，加载失败不会卡死演出控制器。
- 测试可以在注册表和运行时加载器接口上完成，而不需要依赖真实 Pixi 画布。

## 非目标

- 不支持运行时 TypeScript、JSX 或依赖 npm 包的裸模块导入；特效文件必须是浏览器可执行的
  JavaScript。
- 不实现当前页面内的热替换。修改已加载的文件后需要刷新预览页面，浏览器脚本缓存不被强制
  绕过。
- 不允许游戏特效加载外部 URL、访问 `../` 路径或越过当前游戏目录。
- 不把整个 `WebGAL` 核心对象、`PixiStage` 内部对象或 `window.PIXIapp` 作为稳定扩展接口。
- 不改变现有 `pixiPerform` 的演出状态、存档语义和显式卸载语法。
- 不提供代码沙箱。运行时特效代码与游戏代码一样，只能用于作者信任的游戏资源。

## 术语与资源约定

- **内置特效**：构建期由引擎源码注册的特效，如 `snow`。
- **运行时特效**：游戏目录中的 JavaScript 注册的特效。
- **特效名称**：剧本 `pixiPerform:` 后的内容，必须匹配：
  `[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*`。
- **特效文件**：将名称中的 `/` 保留为目录分隔符，并追加 `.js`：
  `weather/rain` 对应 `game/pixi-performs/weather/rain.js`。
- **游戏根目录**：运行时 URL 下的 `./game/`，特效脚本和特效资源都必须从此目录解析。

名称不区分内置或运行时来源。内置注册表优先；只有 `getPerforms()` 找不到该名称时才尝试
加载运行时文件。

## 作者使用方式

游戏目录如下：

```text
game/
├─ pixi-performs/
│  └─ weather/rain.js
└─ tex/
   └─ rain.png
```

剧本保持简单：

```text
pixiPerform:weather/rain;
```

运行时特效文件使用经典脚本格式，由引擎提供的全局扩展接口注册：

```js
(() => {
  const { register } = window.WebGALPixiPerform;

  register('weather/rain', {
    fg({ PIXI, container, screen, asset, onTick, requestRender }) {
      const sprite = PIXI.Sprite.from(asset('tex/rain.png'));
      sprite.anchor.set(0.5);
      sprite.position.set(screen.width / 2, screen.height / 2);
      container.addChild(sprite);
      requestRender();

      onTick((delta) => {
        sprite.rotation += 0.01 * delta;
      });
    },
  });
})();
```

脚本可以有自己的普通函数和闭包，引擎不要求作者建立入口文件。纹理通过
`asset('tex/rain.png')` 解析到当前游戏的 `game/` 目录，不能使用绝对 URL 或 `..` 路径。

## 运行时扩展接口

`window.WebGALPixiPerform` 是唯一稳定的全局扩展接口：

```ts
interface WebGALPixiPerformRuntime {
  readonly version: 1;
  register(name: string, definition: RuntimePerformDefinition): void;
}

interface RuntimePerformDefinition {
  fg?: RuntimeLayerSetup;
  bg?: RuntimeLayerSetup;
}

type RuntimeLayerSetup = (context: RuntimeLayerContext) => void;

interface RuntimeLayerContext {
  readonly PIXI: typeof PIXI;
  readonly container: PIXI.Container;
  readonly screen: { readonly width: number; readonly height: number };
  asset(path: string): string;
  onTick(callback: PIXI.TickerCallback<number>): () => void;
  onDispose(callback: () => void): void;
  requestRender(): void;
}
```

接口约束：

- `register` 只接受至少有一个 `fg` 或 `bg` 的定义。
- 特效文件必须在经典脚本同步执行期间注册与文件路径对应的唯一名称。加载器在 `script`
  元素的 `dataset` 中记录预期名称，`register` 通过 `document.currentScript` 校验调用来源；
  异步注册、名称不匹配和覆盖内置特效都被拒绝。
- `container` 已经挂载到前景层或背景层。作者不需要访问 `PixiStage`。
- `onTick` 由引擎集中转发到一个阶段动画；返回的取消函数只取消当前回调，不销毁容器。
- `onDispose` 注册的清理函数在演出卸载前执行一次，适合清理 DOM 监听器、定时器和外部资源。
- 引擎负责销毁容器、移除 ticker 和触发最终渲染。特效不应调用 `container.destroy()`。
- `asset` 接受相对于 `game/` 的路径，拒绝绝对 URL、协议、空路径和包含 `..` 的路径段。
- `PIXI` 是引擎正在使用的同一个 Pixi 实例，禁止运行时脚本再次加载另一份 Pixi。
- `version` 用于未来扩展接口兼容性检查；首期只实现版本 `1`。

## 加载与执行流程

### 加载时机

`pixi` 命令在 commit 后的 `startFunction` 中调用 `ensurePerformLoaded(sentence.content)`。
模块加载属于运行时副作用，不在命令函数阶段启动；实时预览中被丢弃、从未启动的 pending
perform 因此不会请求脚本。

`ensurePerformLoaded` 按以下顺序工作：

1. 如果注册表已有内置或已加载运行时特效，立即返回已完成的 Promise。
2. 校验特效名称并生成当前游戏目录下的脚本 URL。
3. 使用动态创建的经典 `<script src="...">` 加载脚本。该方式复用现有入口中的 IIFE
   插件加载模式，避免把资源目录要求绑定到某个打包器，并以 Web、Electron 和 Android
   的游戏资源交付方式为目标；三个目标的实际资源路径验证是发布验收门槛。
4. 脚本 `load` 事件发生后检查目标名称是否已经注册；没有注册则视为模块契约错误。
5. 同一名称的并发请求共享一个 Promise。加载成功的脚本只执行一次；失败的请求从加载缓存
   中移除，允许预览页面在修正文件后重试。

运行时加载缓存只用于请求去重和脚本生命周期，不是另一份业务数据真相。页面刷新后浏览器
脚本缓存按正常 HTTP 规则重新判断资源。

### 演出生命周期

现有 `pixi` 命令继续返回 `IPerform`，但其 `startFunction` 不再直接假设特效已经注册：

1. 命令函数只返回保持型 `IPerform`，不加载脚本或操作 Pixi。
2. `startFunction` 先同步查询注册表。内置或已加载的运行时特效直接调用现有 `call(name)`；
   未知名称才启动加载 Promise，成功后再调用 `call(name)` 并挂载返回的前景/背景层。
3. 模块加载期间 `blockingNext()` 和 `blockingAuto()` 返回 `true`，防止用户或自动播放在
   特效尚未建立时继续推进。
4. 模块成功或失败后都解除阻塞。失败时记录包含文件 URL、特效名称和原因的错误，并通过
   `PerformController.softUnmountPerform()` 回收当前 perform，不保留一个永久 hold 演出。
5. 演出在加载完成前被强制卸载时先标记为 disposed；异步回调发现该标记后不得创建容器或
   注册 ticker。
6. 正常卸载时先执行运行时 `onDispose` 回调，再沿用现有的容器销毁、ticker 移除和图层移除
   流程。

加载 Promise 不改变可恢复的 stage state。特效的容器、ticker、脚本加载状态和纹理缓存都
是运行时对象，不进入存档。

### 内置特效优先级

内置特效不经过网络或 DOM 脚本加载，保持现有同步行为。只有未知名称才访问游戏目录；因此
拼写错误的内置名称会多一次本地脚本查找，最终按照运行时模块错误报告，不会静默调用其他
特效。

## 错误处理

以下情况必须记录错误并释放当前演出的推进阻塞：

- 名称不符合路径规则。
- 脚本请求失败、返回非 JavaScript 内容或超时（超时时间由实现确定，建议 10 秒）。
- 脚本执行后没有注册请求的特效名称。
- 注册对象不是对象、没有 `fg`/`bg` 函数，或 setup 抛出异常。
- `asset()` 收到越权路径。
- `onTick`、`onDispose` 或渲染回调执行期间抛出异常。

错误日志至少包含：特效名称、规范化路径、加载阶段或生命周期阶段、原始错误对象。错误
不能让整个场景执行 Promise 未处理拒绝，也不能留下未清理的 ticker、容器或 hold 演出。

## 安全边界

运行时特效是可信游戏代码，不是沙箱插件。它可以使用当前渲染器所在页面允许的浏览器能力，
因此不应从不可信来源加载游戏包，Electron 发行环境尤其需要遵守现有 preload 和 CSP 策略。

引擎必须执行以下限制：

- 只从当前游戏 `game/pixi-performs/` 根路径下加载脚本。
- 拒绝 `..`、反斜杠、协议、查询注入和跨源 URL。
- 只创建 `script` 元素，不把作者字符串拼接为内联脚本执行。
- `register` 只接受当前由加载器创建的 `document.currentScript`，且注册名称必须与该脚本的
  预期名称完全一致。
- 不把 Electron 原生桥接对象添加到运行时扩展接口。
- 未来如需支持第三方来源或不可信游戏，应另行设计 Worker/iframe 沙箱，不能在本 RFC
  上直接放宽路径限制。

## Terre 与导出影响

Terre 当前 Web、Electron 和 Android 导出都会复制游戏目录；运行时特效文件只要存放在
`game/pixi-performs/` 下，就会随游戏资源交付，不需要把文件加入引擎模板或重新打包引擎：

- Web 导出复制整个 `game/` 目录。
- Electron 导出复制整个 `game/` 目录到 `public/game/`。
- Android 导出复制整个 `game/` 目录到应用资产目录。

Terre 首期不需要为特效生成 `index.js`。如果当前资源管理器不允许创建或编辑 `.js` 文件，
只增加普通文本文件的创建/编辑能力，不做 TypeScript 编译或特效语义解析。预览同步仍按普通
游戏文件变化处理；刷新预览页面后由引擎重新加载脚本。

## 兼容性与迁移

- 没有 `game/pixi-performs/` 目录的游戏完全不受影响。
- 现有内置特效源码和 `registerPerform` 内部接口保持不变；运行时接口通过适配器转换为现有
  `ILayerResult`。
- 现有 `pixiPerform:<name>;` 语法不变，名称中的 `/` 只对新运行时特效开放。
- 运行时特效只支持 `.js`，不支持直接加载现有 `src` 下的 `.ts` 文件。
- 更新后的引擎必须随 WebGAL 模板和 Terre 预览模板发布；游戏作者不需要重新编译自己的特效
  或引擎源码。
- 页面刷新是运行时脚本更新的明确边界；不承诺已执行脚本在同一页面热替换。

## 实现拆分

1. 在 `pixiPerformManager` 旁新增运行时特效适配器，定义 `RuntimeLayerContext` 并负责
   容器、ticker、资源路径和清理生命周期。
2. 新增按名称的脚本加载器，完成名称校验、URL 生成、脚本元素加载、并发去重和错误释放。
3. 在 `pixi` 命令中接入加载 Promise，同时覆盖加载前卸载、加载失败和 setup 异常。
4. 在 `window` 类型声明中加入 `WebGALPixiPerform` 的版本化接口，并在 Pixi 初始化后安装
   运行时对象。
5. 保持 `initRegister` 的构建期内置特效自动导入，不让动态加载器替代内置注册路径。
6. 确认 Terre 的普通 `.js` 文件编辑、预览服务和三种导出路径会保留文件；必要时只修改
   文件管理器，不改模板生成逻辑。
7. 为加载器、路径校验、注册契约、并发去重、失败回收、卸载竞态和运行时 setup 增加 Vitest
   定向测试；为 Web/Electron/Android 做至少一条实际资源路径验收。

## 验收标准

- 只新增 `game/pixi-performs/spark.js` 后，`pixiPerform:spark;` 可以运行。
- 修改 `spark.js` 内容并刷新预览后，新逻辑生效，不需要修改其他文件或运行 `yarn build`。
- 同一文件被两个并行语句首次引用时只加载一次，两个演出实例各自拥有容器和 ticker 清理。
- 文件不存在、名称非法、没有注册目标名称、setup 抛错时，场景可以继续，且没有永久阻塞、
  未处理 Promise、遗留容器或遗留 ticker。
- 在演出加载完成前强制切换场景，不会在旧场景中晚到挂载特效。
- 内置 `snow`、`rain`、`heavySnow` 行为和已有卸载逻辑不变。
- Web 预览、Web 导出、Electron 导出和 Android 导出都能读取对应 `.js` 和纹理资源。
- 执行受影响模块的定向测试，并在实现完成后按 WebGAL 维护流程运行 `yarn webgal:build`，
  确认 `packages/webgal/dist/index.html` 已生成，再用 Terre 的 `yarn update-engine` 刷新预览模板。

## 结论

采用“名称到文件”的运行时加载约定，而不是运行时清单或 `index.js`。引擎只需一次升级提供
加载器和生命周期适配器；此后每个 Pixi 特效就是一个独立的 `game/pixi-performs/<name>.js`
文件，作者可以直接新增或修改它，不再为特效变更编译引擎。
