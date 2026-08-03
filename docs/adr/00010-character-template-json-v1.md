# 角色模板 JSON 第一版结构

`game/figure/<角色模板选择符>/figure.json` 使用 `Version`、Terre 自动生成的 `fingerprint`、显式 `canvas`、`components` 和 `presets` 五个根字段。部件以相对模板路径、固定 `x`、`y` 与可选等比 `scale` 定义；预设为可递归引用部件和预设名称的有序列表，名称在模板内唯一。
