# WebGAL 4.6 TuanChat 迁移任务

## 目标

在 WebGAL 4.6 当前体系上恢复团剧共创相关能力，不把旧实现无差别回滚到 4.5 风格；优先复用 4.6 现有脚本、舞台、预览同步、资源与 store 机制。

## 任务清单

- [x] 盘点当前 WebGAL 分支状态与旧迁移分支差异。
- [x] 将 `chore/migrate-local-changes-20260214` 中已基于 4.6 整理过的 TuanChat/WebGAL 改造重新合入当前工作区。
- [x] 迁移并验证 parser / script command：`miniAvatar`、`dice`、`pixiPerform`、`setVar` 字符串增强。
- [x] 迁移并验证运行时 UI：小头像、骰子演出、TRPG 骰子 burst、战斗地图覆盖层。
- [x] 迁移并验证 WebGAL 配置 gate：`Allow_Full_Settings`、`Enable_Speaker_Focus`、`Show_panic`、`Enable_Appreciation`、打字音配置。
- [x] 迁移并验证预览同步能力：Terre WebSocket、临时场景、效果同步、强制刷新。
- [x] 保留并复核本轮修复：说话人聚焦、战斗地图小尺寸网格可见、realtime marker 升级。
- [x] 构建 WebGAL 引擎并同步 Terre 模板。
- [x] 修复回归：TRPG 骰子不再渲染 WebGAL 舞台结果浮层，实时脚本不再输出 `dice:... -mode=trpg;`。
- [x] 输出验收清单。

## 验收命令

- `yarn webgal:build`：通过。
- `yarn update-engine`（在 `D:\A_collection\WebGAL_Terre\packages\terre2`）：通过。
- TuanChat 侧相关命令：
  - `pnpm typecheck`：通过。
  - `pnpm run test -- --maxWorkers=16 app/webGAL/realtimeRendererDice.test.ts app/components/chat/core/realtimeRenderAutoAdvance.test.ts app/components/chat/shared/webgal/webGalPreviewState.test.ts`：通过，3 个测试文件、12 个测试用例通过。

## 手工验收点

- 小尺寸 WebGAL 预览仍显示战斗地图网格。
- 说话人聚焦能按 `-figureId` / `-left` / `-right` / `-center` 生效。
- `miniAvatar` 能显示和清空。
- TRPG 骰子只保留 `pixiPerform` burst 与掷骰音效，不显示 WebGAL 舞台结果卡，结束后可继续推进剧情。
- 战斗地图覆盖层只显示地图和棋子，不出现多余卡片说明。
- 旧 `realtime_*` 工程因 marker 变化自动重建。
