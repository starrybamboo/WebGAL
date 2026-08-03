# Terre 仅将规范路径的 figure.json 作为角色模板

Terre 仅在双击 `game/figure/<角色模板选择符>/figure.json` 时打开角色模板编辑器；其他 JSON 文件按普通文本资源处理。该路径边界避免无关配置被误解析成立绘模板，并使模板选择符与资源目录保持一一对应。
