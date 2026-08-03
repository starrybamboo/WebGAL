# 01 — 删除私有立绘合成遗留代码

**What to build:** 清除个人维护分支中的 `composeFigure` Demo 和 `-composite` 实验语义，让后续 `character` 实现建立在 WebGAL 4.6.2 的正式 figure 行为之上，同时保留其他本地私有功能。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `composeFigure` 不再是可解析、可执行或可导出的 script。
- [ ] `changeFigure`、资源扫描和舞台重置不再包含 `-composite` 专用分支或组合别名处理。
- [ ] 实验性合成缓存、生命周期清理函数及其专用测试已删除，仓库中不存在有效代码引用。
- [ ] 其他本地私有命令和功能未因本任务被删除或改写。
- [ ] 既有普通图片、Live2D、Spine `changeFigure` 行为和相关测试继续通过。

