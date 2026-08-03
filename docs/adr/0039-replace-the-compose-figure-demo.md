# 以角色模板机制替换 composeFigure Demo

现有 `composeFigure` Demo 及其 `-composite` 语义不进入主线实现，应连同专属命令、解析分支和测试一并移除。正式功能只通过 `changeFigure:角色模板选择符/组合列表` 进入，并以 WebGAL 4.6.2 主线立绘行为作为演出基线，避免两套组合规则长期并存。
