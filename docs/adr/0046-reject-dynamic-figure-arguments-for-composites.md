# 组合立绘拒绝动态立绘参数

组合立绘继续支持位置、`-id`、变换、缓动、进出场、时长、`-zIndex`、`-blendMode` 和默认演出配置，但拒绝资源类型专属参数：`motion`、`skin`、`expression`、`bounds`、`blink`、`focus`。这些参数只属于普通 `changeFigure` 的 Live2D 或 Spine 分支；Character 位图面部运行时不接管它们。

旧 `changeFigure` 整图面部参数 `mouthOpen`、`mouthClose`、`mouthHalfOpen`、`eyesOpen`、`eyesClose` 及其 `animationFlag` 已由 ADR 0058 删除，不再属于普通 Figure 或组合立绘的脚本 ABI。ADR 0057 仍允许角色模板在 `figure.json` 中声明受限的位图 `facialRig`；它不放宽本 ADR 的脚本参数边界，也不提供通用部件级切换。
