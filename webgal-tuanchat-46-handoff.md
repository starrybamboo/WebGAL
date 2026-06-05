# WebGAL 4.6 TuanChat 迁移交接

## 背景

本轮目标是在 WebGAL 4.6 当前体系上恢复团剧共创相关能力，不回退到旧 4.5 风格。迁移来源是已经基于 4.6 整理过的本地分支：

- `chore/migrate-local-changes-20260214`

当前迁移不是简单回滚，而是把 TuanChat 所需能力接回 4.6 的 parser、stage、preview sync、资源与状态体系。

## 主要路径

- WebGAL 源码：`D:\A_collection\WebGAL`
- WebGAL 任务清单：`D:\A_collection\WebGAL\task.md`
- Terre：`D:\A_collection\WebGAL_Terre\packages\terre2`
- TuanChat 前端：`D:\A_collection\tuan-chat-web`

## 已完成内容

- 恢复 WebGAL parser / script command：
  - `miniAvatar`
  - `dice`
  - `pixiPerform`
  - `setVar` 字符串字面量增强
- 恢复运行时能力：
  - 小头像
  - TRPG 骰子 burst
  - WebGAL 战斗地图覆盖层
  - 说话人聚焦
  - `stageStateManager`
  - `readHistory`
  - WebP mux 支持
- 恢复配置 gate：
  - `Allow_Full_Settings`
  - `Enable_Speaker_Focus`
  - `Show_panic`
  - `Enable_Appreciation`
  - 打字音配置
- 恢复 Terre/WebGAL 预览同步相关能力：
  - WebSocket 同步
  - 临时场景
  - 效果同步
  - 强制刷新
- 已同步 WebGAL 构建产物到 Terre 模板。

## 已修复的回归

### TRPG 骰子结果浮层

问题：迁移时把旧的 WebGAL `DicePerform` 舞台结果卡带回来了，导致 WebGAL 预览中间出现骰子结果卡，提前/重复暴露结果。

处理：

- WebGAL 引擎侧：
  - 文件：`D:\A_collection\WebGAL\packages\webgal\src\Core\gameScripts\dicePerform.ts`
  - 已移除 WebGAL 引擎侧针对 TRPG dice mode 的特判，并删除 `dicePerform.mode` 状态字段。
  - `dice` 只保留普通 WebGAL 舞台骰子浮层；TuanChat TRPG 骰子不再依赖 WebGAL `dice` 协议。
  - 文件：`D:\A_collection\WebGAL\packages\webgal\src\Stage\DicePerform\DicePerform.tsx`
  - 已移除 TRPG D100 结果卡识别、判定和动画分支。
- TuanChat 实时脚本侧：
  - 文件：`D:\A_collection\tuan-chat-web\app\webGAL\realtimeRenderer.ts`
  - TRPG 骰子不再输出 WebGAL `dice` 命令。
  - 旧 `webgal.diceRender.mode="script"` 里夹带的 `pixiPerform + dice:` TRPG 载荷会被强制回新 TRPG 演出，避免旧卡片从历史数据里复活。
  - WebGAL 场景脚本中的资源引用不写 Terre localhost 或外部 URL；远端资源先上传到 WebGAL 工程，再写 `./game/...` 相对路径。
  - 只输出：
    - `pixiPerform:effect.trpgDiceBurst -once -duration=720 -scale=1.08 -next;`
    - `playEffect:./game/se/nettimato-rolling-dice-1.wav -next;`
- 回归测试：
  - 文件：`D:\A_collection\tuan-chat-web\app\webGAL\realtimeRendererDice.test.ts`
  - 已断言 TRPG 骰子实时脚本不会再生成 `dice:` 命令。

## Realtime Marker

TuanChat realtime WebGAL 工程 marker 已升级：

```ts
const REALTIME_GAME_ENGINE_MARKER_VERSION = "realtime-tuanchat-battle-overlay-dice-script-sanitize-grid-v14";
```

文件：

- `D:\A_collection\tuan-chat-web\app\webGAL\realtimeRenderer.ts`

作用：旧 `realtime_*` 工程会自动重建，避免继续使用带骰子浮层的旧脚本。

## 关键修改文件

- `D:\A_collection\WebGAL\packages\webgal\src\Core\gameScripts\dicePerform.ts`
- `D:\A_collection\WebGAL\packages\webgal\src\Stage\Stage.tsx`
- `D:\A_collection\WebGAL\packages\webgal\src\Stage\DicePerform\DicePerform.tsx`
- `D:\A_collection\WebGAL\packages\webgal\src\Stage\TuanChatBattleOverlay\TuanChatBattleOverlay.tsx`
- `D:\A_collection\WebGAL\packages\webgal\src\Stage\TuanChatBattleOverlay\tuanChatBattleOverlay.module.scss`
- `D:\A_collection\WebGAL\packages\webgal\src\Core\Modules\stage\stageStateManager.ts`
- `D:\A_collection\WebGAL\packages\webgal\src\hooks\useStageState.ts`
- `D:\A_collection\tuan-chat-web\app\webGAL\realtimeRenderer.ts`
- `D:\A_collection\tuan-chat-web\app\webGAL\realtimeRendererDice.ts`
- `D:\A_collection\tuan-chat-web\app\webGAL\realtimeRendererDice.test.ts`

## 已执行验证

在 `D:\A_collection\WebGAL`：

```powershell
yarn webgal:build
```

结果：通过。

在 `D:\A_collection\WebGAL_Terre\packages\terre2`：

```powershell
yarn update-engine
```

结果：通过。

在 `D:\A_collection\tuan-chat-web`：

```powershell
pnpm typecheck
```

结果：通过。

在 `D:\A_collection\tuan-chat-web`：

```powershell
pnpm run test -- --maxWorkers=16 app/webGAL/realtimeRendererDice.test.ts app/components/chat/core/realtimeRenderAutoAdvance.test.ts app/components/chat/shared/webgal/webGalPreviewState.test.ts
```

结果：通过，3 个测试文件、12 个测试用例通过。

## 手工验收清单

- 打开 TuanChat 房间的 WebGAL 预览。
- 确认标题为 `WebGAL 预览`。
- 打开或关闭 `实时渲染`，确认新消息 position 超过当前最大 position 时能自动推进。
- 发送 TRPG 骰子消息，确认 WebGAL 中不再出现居中的骰子结果卡。
- 确认 TRPG 骰子仍有 `trpgDiceBurst` 视觉效果和掷骰音效。
- 确认骰子效果结束后可以继续推进剧情，不会卡在骰子页。
- 小尺寸 WebGAL 预览中战斗地图 grid 仍可见。
- 战斗地图覆盖层只显示地图和棋子，不出现多余卡片/说明区。
- token 使用角色头像，不使用纯数字代替。
- 说话人聚焦按 `-figureId` / `-left` / `-right` / `-center` 生效。
- `miniAvatar` 能显示和清空。

## 注意事项

- 当前工作树很脏，有大量其他代理或历史 WIP。不要执行 `git reset --hard`、`git clean -fd`、`git checkout --` 等破坏性操作。
- 不要 stash。
- 只关注本轮相关文件，不要回滚无关改动。
- 修改 WebGAL 源码后需要重新执行：

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

## 新对话建议开场

可以把这份文件发给新对话，并要求：

> 请基于 `D:\A_collection\WebGAL\webgal-tuanchat-46-handoff.md` 继续验证 WebGAL 4.6 TuanChat 迁移，重点检查 WebGAL 预览里 TRPG 骰子浮层是否已消失、地图 grid 是否正常、说话人聚焦和 miniAvatar 是否仍工作。
