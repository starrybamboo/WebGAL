# 团剧共创 WebGAL 魔改规格

## 文档状态

- 状态：已实现规格整理
- 适用范围：WebGAL 4.6 体系内用于团剧共创实时预览、回放与打包的引擎侧改造
- 相关系统：`D:\A_collection\WebGAL`、`D:\A_collection\WebGAL_Terre\packages\terre2`、`D:\A_collection\tuan-chat-web`
- 最近整理日期：2026-05-30

## 业务目标

团剧共创需要把聊天室消息、角色头像、战斗地图、骰子事件、状态事件和实时预览控制转换成 WebGAL 可播放的视觉小说场景。WebGAL 引擎侧的魔改目标不是回退到旧 4.5 实现，而是在 WebGAL 4.6 的 parser、stage state、Pixi 舞台、配置变量和 Terre 同步体系上补齐 TuanChat 所需能力。

核心体验要求：

- 聊天消息可以持续增量写入 WebGAL 场景，并在预览中稳定推进。
- 角色消息可以显示立绘、说话人聚焦、TTS 语音和标注特效，并复用 WebGAL 原生小头像能力。
- TRPG 骰子可以保留视觉反馈和音效，但不能提前或重复暴露骰子结果卡。
- 战斗地图可以以覆盖层形式展示地图、网格和角色 token，不挤占对白区域。
- Terre 预览和 TuanChat 实时渲染之间可以同步场景、临时脚本、效果调节和强制刷新。

## 非目标

- 不把 TuanChat 业务逻辑硬编码成 WebGAL 原生命令体系的唯一行为。
- 不要求 WebGAL 根据角色名猜测立绘槽位；需要聚焦时必须由脚本提供明确发言目标。
- WebGAL `dice` 协议不定义 TRPG 兼容模式；TuanChat TRPG 骰子由 Pixi 特效和音效表达。
- 不在 WebGAL 内直接访问 TuanChat API；TuanChat 负责生成脚本、上传素材和写入状态变量。

## 架构边界

### TuanChat 侧职责

TuanChat 的 realtime renderer 负责把聊天室消息转换为 WebGAL 场景脚本和资源：

- 写入 `game/config.txt` 中的 TuanChat 相关配置项。
- 上传并引用角色立绘、小头像、地图、token 头像、TTS 语音和音效资源。
- 为角色对白生成 `changeFigure`、对白行、`playEffect`、`pixiPerform` 等脚本；小头像使用 WebGAL 原生 `miniAvatar` 命令接线。
- 将战斗状态事件转换为 `setVar` 行，写入 `tuanchat.*` 变量。
- 通过 realtime marker 判断旧 `realtime_*` 工程是否需要重建。

### WebGAL 引擎侧职责

WebGAL 引擎负责解析和执行 TuanChat 生成的标准 WebGAL 脚本扩展：

- parser 识别 `dice`、`pixiPerform`、增强 `setVar` 等 TuanChat 相关命令。
- stage state 保存小头像、骰子浮层、说话人目标、战斗地图变量和 Pixi 演出状态。
- Pixi 舞台渲染立绘、背景、特效、TRPG burst、说话人聚焦和战斗地图覆盖层。
- WebSocket debug 协议接收 Terre/TuanChat 的跳转、临时场景、效果同步和刷新命令。

### Terre 侧职责

Terre 使用 `node_modules/webgal-engine/dist` 和 `assets/templates/WebGAL_Template` 中的引擎产物。修改 WebGAL 源码后必须构建并同步 Terre，否则预览可能仍运行旧引擎。

## 脚本协议

### 资源引用规范

TuanChat 生成 WebGAL 场景脚本时，资源命令和资源变量必须引用当前 WebGAL 工程内的相对路径，不得把 Terre 服务地址或外部资源 URL 写入脚本。

要求：

- 禁止在 `changeFigure`、`miniAvatar`、`playEffect`、`playBgm`、`setVar:tuanchat.*Url=...` 等脚本输出中写入 `http://...`、`https://...` 或 `/games/<game>/...`。
- 远端或 TuanChat 媒体资源必须先上传/复制到 WebGAL 工程目录，再写入 `./game/...` 或 WebGAL 命令既有的工程内相对文件名。
- 音效示例：默认 TRPG 骰子音效应写为 `playEffect:./game/se/nettimato-rolling-dice-1.wav -next;`。
- 地图和 token 头像变量应写入 `./game/background/...`、`./game/figure/...` 等工程内路径。
- Terre 预览入口 URL、Terre API 文件路径和上传源 URL 只允许存在于 TuanChat 内部实现，不得落入 WebGAL 场景脚本。

### `dice`

格式：

```webgal
dice:<content>;
dice:none -clear;
```

要求：

- `dice` 设置 `stageState.dicePerform` 并显示 WebGAL 舞台骰子结果浮层。
- WebGAL `dice` 不提供 mode；TuanChat 不应为 TRPG 骰子生成 `dice` 命令。
- 当普通骰子浮层可见时，应清空 `showText`、`showName`、`currentConcatDialogPrev`，避免文本框与浮层重复表达。
- TuanChat TRPG 骰子应使用 `pixiPerform:effect.trpgDiceBurst ... -next;` 和 `playEffect:./game/se/<file> -next;` 表达视觉与音效反馈。

### `pixiPerform`

格式：

```webgal
pixiPerform:<perform-name> -target=<target> -once -duration=<ms> -next;
```

要求：

- `effect.trpgDiceBurst` 是 TuanChat TRPG 骰子专用 Pixi 特效。
- 标注特效可通过 `-target`、`-screenX`、`-screenY`、`-offsetX`、`-duration` 等参数对齐角色或屏幕位置。
- 一次性视觉效果应在结束后清理自身，不阻塞后续剧情推进。

### `setVar`

格式：

```webgal
setVar:<key>=<value>;
setVar:<key>=<expression>;
setVar:<key>=<value> -global;
```

要求：

- 支持 number、boolean、空字符串、字符串字面量和简单表达式。
- 字符串值由 TuanChat 使用 JSON 字符串格式写入，例如 `setVar:tuanchat.map.imageUrl="...";`。
- 普通变量写入当前 stage `GameVar`。
- `-global` 写入 userData `globalGameVar`，用于配置开关等跨场景状态。
- 变量键不得包含 `=`、`;` 或换行；TuanChat 侧生成脚本时应过滤非法键。

## 角色与对白

### 复用的原生小头像能力

`miniAvatar` 是 WebGAL 4.6 原生命令，不属于本规格定义的 WebGAL 魔改项。团剧共创只在 TuanChat 脚本生成侧复用它：

- 需要小头像时输出 `miniAvatar:<file>;`。
- 需要清空时输出 `miniAvatar:none;`。
- WebGAL 引擎侧不为团剧共创修改 `miniAvatar` 命令语义。
- 小头像接线问题应归入 TuanChat realtime renderer 规格，不归入 WebGAL 引擎魔改范围。

### 立绘目标

TuanChat 生成角色对白时，只有在消息允许显示立绘并解析出有效位置时才输出 `changeFigure` 和对白 `-figureId=<slot-id>`。有效位置为 `left`、`center`、`right`。

WebGAL 侧对白目标解析规则：

- `-figureId=<id>` 优先作为明确发言目标。
- 没有 `-figureId` 时，`-left`、`-center`、`-right` 可解析为 `fig-left`、`fig-center`、`fig-right`。
- 目标可以是预设立绘槽位，也可以是 `changeFigure -id=<id>` 创建的自由立绘。
- 没有明确目标时，`speakingFigureKey` 置空。

### 说话人聚焦

业务效果：

- 开启后，当前发言角色保持基础亮度，其他可见角色变暗。
- 当前默认非说话人亮度倍率为 `0.72`。
- 标准舞台说话人亮度倍率为 `1`；`MainStage` 辅助 hook 可使用 `1.12` 的轻微强调。

配置：

```txt
Enable_Speaker_Focus=true
```

要求：

- 默认开启；配置值支持 string、boolean、number，并按安全 boolean 解析。
- `say` 和 `vocal` 必须通过同一目标解析规则更新 `speakingFigureKey`。
- WebGAL 不根据显示角色名猜测发言立绘，避免旁白、KP 叙述、系统文本错误继承上一位角色。
- 聚焦必须在 Pixi `effects` 应用后重新应用，并在亮度改变时请求重绘，保证句子播放完停住时仍保持聚焦。
- 当被聚焦立绘被清除时，应同步清空 `speakingFigureKey`。

## 战斗地图覆盖层

WebGAL 侧组件：`TuanChatBattleOverlay`。

显示条件：

- `tuanchat.combat.active` 为 `true`。
- 地图配置存在，或 postMessage 快照中提供 map。

数据来源：

- 主路径：stage `GameVar` 中的 `tuanchat.*` 变量。
- 辅助路径：父窗口 `postMessage` 发送 `TUANCHAT_BATTLE_OVERLAY_SYNC` 快照。
- WebGAL 载入后会向父窗口发送 `TUANCHAT_BATTLE_OVERLAY_READY`，schema version 为 `1`。

变量协议：

```txt
tuanchat.roleIds
tuanchat.combat.active
tuanchat.combat.turn
tuanchat.map.hasConfig
tuanchat.map.fileId
tuanchat.map.imageUrl
tuanchat.map.gridRows
tuanchat.map.gridCols
tuanchat.map.gridColor
tuanchat.map.tokenRoleIds
tuanchat.role.<roleId>.avatarUrl
tuanchat.role.<roleId>.<abilityKey>
tuanchat.map.token.<roleId>.active
tuanchat.map.token.<roleId>.rowIndex
tuanchat.map.token.<roleId>.colIndex
```

要求：

- 地图覆盖层只显示地图、网格和 token，不显示额外说明卡片。
- token 优先使用角色头像；缺少头像时才使用文本 fallback。
- 网格行列数必须为正整数；非法值回退为 `10 x 10`。
- 网格颜色必须是 `#RGB`、`#RRGGBB` 或兼容长度的十六进制颜色；非法值回退为 `#808080`。
- token 坐标使用 `rowIndex`、`colIndex`，从 `0` 开始。
- 小尺寸预览中地图 grid 必须仍可见。

## 配置开关

TuanChat 可写入以下 WebGAL config 项：

```txt
Show_panic=true|false
Allow_Full_Settings=true|false
Enable_Speaker_Focus=true|false
Default_Language=zh_CN|zh_TW|en|ja|fr|de
Enable_Appreciation=true|false
TypingSoundEnabled=true|false
TypingSoundInterval=<number>
TypingSoundPunctuationPause=<ms>
TypingSoundSe=<asset-path>
```

要求：

- `Show_panic` 控制紧急回避入口。
- `Allow_Full_Settings` 控制玩家能否打开完整设置，默认允许。
- `Enable_Speaker_Focus` 控制说话人聚焦，默认开启。
- `Enable_Appreciation` 控制鉴赏模式入口。
- 打字音配置应由 `IMSSTextbox` 读取并播放 UI 音效，间隔和标点停顿由配置控制。

## 预览同步协议

WebGAL 启动后尝试连接：

```txt
ws(s)://<host>[:port]/api/webgalsync
```

支持命令：

- `SYNCFC`：定期向编辑器发送当前 scene、sentence 和 stage state。
- `JUMP`：跳转到指定 scene/sentence。
- `EXE_COMMAND`：解析并执行临时脚本。
- `TEMP_SCENE`：重置舞台并加载临时场景文本。
- `REFETCH_TEMPLATE_FILES`：触发样式/template 刷新。
- `SET_COMPONENT_VISIBILITY`：控制 UI 组件可见性。
- `SET_EFFECT`：合并并提交指定 Pixi target 的 transform。
- `SET_TEXT_READ_MODE`：切换预览中的文本已读显示模式。
- `FONT_OPTIMIZATION`：切换字体优化配置。

要求：

- 临时场景和临时命令必须走当前 WebGAL parser，不使用单独脚本解释器。
- `SET_EFFECT` 必须先停止目标上的 Pixi 动画，再合并 transform，避免动画和预览拖拽互相覆盖。
- 快速预览超时应向编辑器回传 scene/sentence/stage 信息，便于定位阻塞脚本。

## Stage State 与提交模型

TuanChat 相关运行时状态必须进入 WebGAL 4.6 的 `stageStateManager`：

- `calculationStageState`：脚本 forward 阶段的演算态。
- `viewStageState`：commit 后供 React、Pixi、Audio 读取的视图态。
- `commitHandler`：负责同步 Pixi 舞台对象、Live2D/Spine 参数、metadata 和 effects。
- `subscribe`：供 React hook 订阅 stage state。

TuanChat 相关字段：

- `miniAvatar`
- `dicePerform`
- `speakingFigureKey`
- `GameVar`
- `effects`
- `animationSettings`
- `figureMetaData`
- `PerformList`
- `isRead`

要求：

- 脚本执行时只修改演算态；推进序列结束后统一 commit。
- Pixi effects 应在提交后应用到未被动画锁定的对象。
- 说话人聚焦必须作为 effects 之后的覆盖层处理。
- 非 hold 演出结束时可以清理 `PerformList`，但不能破坏当前 stage 的视觉终态。

## 资源与兼容性

要求：

- WebP 资源必须支持静态 WebP 和需要 mux 处理的 WebP 动图。
- TuanChat 生成的角色立绘、小头像、地图、token 头像应使用 WebGAL 可直接加载的相对路径或 URL。
- `changeFigure` 应支持 `-id`、`-transform`、自定义进出动画、Live2D/Spine motion/expression/blink/focus、zIndex、blendMode 等参数。
- 删除立绘时应同步移除对应 effects、animationSettings，并在删除的是当前说话人时清空聚焦目标。

## Realtime Marker

TuanChat realtime WebGAL 工程需要 marker 文件识别引擎协议版本。当前 marker：

```ts
realtime-tuanchat-battle-overlay-dice-speaker-focus-grid-v13
```

要求：

- 当 WebGAL 引擎脚本协议、默认配置、资源布局或行为语义发生兼容性变更时，TuanChat 侧应升级 marker。
- marker 升级后旧 `realtime_*` 工程应重建，避免继续运行旧脚本或旧模板。

## 构建与同步

修改 WebGAL 源码后执行：

```powershell
cd D:\A_collection\WebGAL
yarn webgal:build
```

然后同步 Terre：

```powershell
$source = (Resolve-Path 'D:\A_collection\WebGAL\packages\webgal\dist').Path
$targetRoot = (Resolve-Path 'D:\A_collection\WebGAL_Terre\packages\terre2\node_modules\webgal-engine').Path
$target = Join-Path $targetRoot 'dist'
$targetFull = [System.IO.Path]::GetFullPath($target)
if (-not $targetFull.StartsWith($targetRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw "target escapes root: $targetFull" }
if (-not (Test-Path (Join-Path $source 'index.html'))) { throw "source dist missing index.html: $source" }
if (Test-Path -LiteralPath $targetFull) { Remove-Item -LiteralPath $targetFull -Recurse -Force }
Copy-Item -LiteralPath $source -Destination $targetFull -Recurse -Force
cd D:\A_collection\WebGAL_Terre\packages\terre2
yarn update-engine
```

## 验收标准

自动验证：

- `yarn webgal:build` 通过。
- Terre `yarn update-engine` 通过。
- TuanChat 侧 `pnpm typecheck` 通过。
- TuanChat 侧相关测试通过，至少覆盖 TRPG 骰子实时脚本不再生成 WebGAL `dice` 命令。

手工验收：

- TuanChat 房间 WebGAL 预览可以打开，标题为 `WebGAL 预览`。
- 实时渲染开启后，新消息可以写入并按 position 推进。
- TRPG 骰子没有 WebGAL 居中结果卡，仍有 `trpgDiceBurst` 视觉效果和掷骰音效。
- 骰子效果结束后可继续推进剧情。
- 小头像可显示并通过 `miniAvatar:none;` 清空。
- 多角色同屏时，说话人聚焦按 `-figureId`、`-left`、`-center`、`-right` 生效，句子播放结束后不掉焦。
- 战斗地图覆盖层只显示地图、网格和 token，小尺寸预览中网格仍可见。
- token 使用角色头像，不使用纯数字替代，除非头像确实缺失。
- 临时场景、强制刷新、效果同步和跳转命令在 Terre 预览中可用。

## 维护注意事项

- 优先在 WebGAL 源码中修改，再构建并同步 Terre；不要只改 Terre 的 `node_modules/webgal-engine/dist` 作为长期方案。
- 不要把旧 4.5 逻辑整块回滚到 4.6；新增能力应接入 4.6 的 `stageStateManager` 和 Pixi sync 模型。
- 与 TuanChat 脚本生成协议相关的行为变更，需要同步更新 TuanChat realtime renderer、测试和 realtime marker。
- 当前仓库可能存在其他代理的 WIP；修改时只触碰本规格相关文件，避免回滚无关改动。
