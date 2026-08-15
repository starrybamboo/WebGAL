# 使用预设作用域的位图 Facial Rig

角色模板可以在对象形式的组合预设上声明可选 `facialRig`，把眼睛和嘴的矩形替换区绑定到该预设的最终组合画布。直接选择部件与旧数组预设可以使用模板顶层 `facialRig` 作为兼容回退；一旦所选对象预设声明自己的画布或 `facialRig`，就由预设完整拥有这组呈现坐标，不再隐式继承顶层 rig。替换片仍只能引用角色目录内的静态 PNG、WebP 或 JPEG，且矩形必须完全位于最终画布内。

组合底图定义睁眼与闭嘴状态。`eyes.closed` 和 `mouth.open` 是对应分支的必需替换片；`eyes.half` 与 `mouth.halfOpen` 可选，缺失时分别直接使用闭眼片和张嘴片。Character 来源适配器在普通组合图片之外交付解析后的 rig 描述，但不把纹理或 Data URL 写入 StageState 与存档。`Facial Rig` 在本决策中始终只指这些 Character 位图资源，不包含 Live2D 模型或跨资源类型的面部行为。

ADR 0058 后续把眨眼和说话的时序所有权移至统一 Figure 面部运行时。位图面部适配器只负责在同一 Figure 容器中挂载眼睛、嘴替换 Sprite，并把统一面部姿态量化到这些资源；替换片继续沿用底图的缩放、位置、滤镜、透明度与进退场变换。Figure 被替换或移除时释放适配器；某一分支纹理加载失败时只记录一次错误并保留底图默认状态，不阻塞角色组合或剧本流程。

本决策不开放脚本级局部替换命令，也不让 `character` 接受整图面部参数。旧 `changeFigure` 的 `mouthOpen`、`mouthClose`、`mouthHalfOpen`、`eyesOpen`、`eyesClose` 与 `animationFlag` 已由 ADR 0058 删除；本决策保留 ADR 0046 拒绝资源类型专属脚本参数的边界。
