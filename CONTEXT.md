# WebGAL 角色管理、静态组合立绘与 Figure 面部

本上下文定义 `character` 角色管理、静态组合立绘与 Figure 面部行为的领域语言，供引擎维护者和脚本作者使用。

## 语言

**角色**：
由 `character` 来源描述标识的舞台人物。角色名用于保证当前 Figure Target 中同名来源最多出现一次，不对应独立的角色状态集合。
_避免使用_：自由立绘、角色模板选择符、figure ID

**角色命令**：
以角色组合为图片来源的新脚本 `character`，例如 `character: yuki/summer_uniform,face_smile -id=4 -transform=...;`。它把完整选择符转换为可恢复的 Figure 来源描述，过滤动态模型专属参数后直接委托上游 `changeFigure`。
_避免使用_：独立立绘渲染系统、角色参数

**角色组合选择符**：
`<角色名>/<组合项>[,<组合项>...]`。斜杠前是舞台唯一的角色名，斜杠后是按顺序展开和叠加的部件或预设引用。
_避免使用_：`-preset` 参数、组合版 changeFigure 路径

**角色模板**：
角色目录中的 `figure.json`，声明组合画布、静态部件、组合预设和可选的面部替换区。它是组合定义输入，不作为 figure 图像或模型资源。
_避免使用_：角色 JSON、立绘文件

**角色目录**：
`game/figure/<角色名>/` 目录，包含该角色的 `figure.json` 与静态部件资源；部件路径相对 `figure.json` 解析。
_避免使用_：立绘文件夹、资源包

**组合画布**：
角色模板显式声明的宽高坐标系；部件偏移相对该画布，越界像素在画布边界裁剪，组合结果保持相同像素尺寸与透明通道。
_避免使用_：舞台画布、全局画布

**静态部件**：
参与组合的一张角色目录内静态位图及其固定 `x`、`y` 和尺寸模式；其左上角从组合画布左上角定位。
_避免使用_：动态部件、子立绘

**部件尺寸模式**：
静态部件使用原始尺寸、等比 `scale` 或成对的 `width`、`height` 精确尺寸之一。精确尺寸允许非等比拉伸，不能与 `scale` 同时声明。
_避免使用_：隐式尺寸、混合缩放

**组合预设**：
角色模板内命名的有序部件列表，可在引用位置递归展开其他预设；展开顺序就是叠加序，重复引用保留。对象预设还可以拥有自己的组合画布和与该画布绑定的面部替换区。
_避免使用_：角色状态、figure 路径

**组合结果**：
角色模板和预设预先合成的一张普通底图；底图定义睁眼与闭嘴状态。它作为普通图像进入 figure 控制系统，可选面部 rig 只作为同一 Figure 实例的运行时附属描述交付，不进入 StageState 或存档。
_避免使用_：figure.json、部件树

**面部替换区（Facial Rig）**：
仅属于 Character 静态位图模板的眼睛、嘴矩形及其小型替换片。眼睛分支以 `closed` 为必需片、`half` 为可选片；嘴分支以 `open` 为必需片、`halfOpen` 为可选片，全部绑定到最终组合画布。
_避免使用_：Live2D rig、Figure 面部运行时、完整表情部件树

**Figure 面部运行时（Figure Face Runtime）**：
附着于 Character 位图 Figure Target 的瞬态面部行为所有者，将语音轨道与眨眼轨道合成为面部姿态，并交给位图面部适配器。它不属于 StageState 或存档，也不接管 Live2D 或 Spine。
_避免使用_：分层面部控制器、第二套 Figure、持久化面部状态

**面部姿态（Face Pose）**：
同一采样时刻的眼睛睁开度与嘴巴张开度。两个通道独立演进，但作为一个姿态整体呈现，避免眼睛与嘴互相覆盖。
_避免使用_：组合口眼状态机、整图动画帧

**语音轨道（Speech Track）**：
一次说话期间的嘴巴张开度信号，来源可以是语音时间线或文本时间线，由 Character 位图 Facial Rig 呈现。
_避免使用_：随机嘴型计时器、整图口型动画

**眨眼轨道（Blink Track）**：
Character 位图 Figure 附着期间的眼睛睁开度序列，由位图面部运行时控制且不随某句语音开始或结束。Live2D 与 Spine 不使用这条轨道。
_避免使用_：语音眨眼、眼睛整图动画

**位图面部适配器（Bitmap Face Adapter）**：
把面部姿态映射到 Facial Rig 声明的位图替换片；底图承担睁眼与闭嘴状态，替换片承担半闭、闭眼、半开与张嘴状态。
_避免使用_：位图面部运行时、Live2D rig

**角色唯一性**：
当前 Figure Target 中同一个角色名最多出现一次；新的同名 `character` 命令先移除旧目标，再写入本次完整来源描述和目标。
_避免使用_：同模板多实例、同名自由立绘

**角色 Figure 来源描述（Character Figure Source）**：
保存在当前 Figure Target 中的稳定、可序列化图片来源，包含角色名与本次完整组合列表。渲染时根据它异步合成普通图片；存档不保存合成后的 Blob、Canvas 或纹理。
_避免使用_：角色状态、合成结果

**上游 Figure 主链（Upstream Figure Path）**：
OpenWebGAL dev 的 `changeFigure → StageState → Pixi sync → animation` 链路。它是普通图片、Live2D、Spine 和 Character 静态结果唯一的目标状态与演出实现；Character 调用它，不替换、复制或抽取第二套通用 Figure 模块。
_避免使用_：共享 Figure Target 模块、Character Figure 主链

**Character 来源适配 seam（Character Source Adapter Seam）**：
普通 Figure 主链遇到 `webgal-character-source:` 来源描述时交给 Character adapter 异步合成，并在结果仍匹配当前目标时交付普通图片。该 seam 只识别 Character 前缀，不改变普通图片、Live2D 或 Spine 的同步分支。
_避免使用_：通用资源解析框架、Figure 渲染替代层

**静态 Figure 通用参数**：
普通静态图片进入上游 Figure 主链时使用的目标、变换、滤镜、层级、混合模式和进出场动画参数。`character` 只把这组脚本参数委托给 `changeFigure`，不传递 Live2D、Spine 专属参数；旧整图口型、眼睛与 `animationFlag` 已不属于当前 Figure 脚本语言。
_避免使用_：全部 changeFigure 参数、动态模型参数

**Figure 目标选择（Figure Target Selection）**：
`character` 与 `changeFigure` 共用的目标解析规则。显式 `-id` 决定自由 Figure Target；命名位置参数决定基础位置，在没有 `-id` 时也决定 `fig-<position>` 目标；没有位置参数时默认使用 `center`。
_避免使用_：团剧共创固定槽位、角色身份

**角色清除**：
从当前 Figure Target 中移除指定角色来源或全部角色来源，并非阻塞地完成其视觉退出。角色清除不作用于普通图片、Live2D 或 Spine 来源。
_避免使用_：隐藏角色、清除全部立绘

**非阻塞组合加载**：
角色模板、部件或组合结果尚未就绪时，读档和脚本流程仍继续执行，与现有立绘网络请求一致。
_避免使用_：等待组合、阻塞读档

**本轮组合缓存**：
仅在当前游戏进程中复用已生成的组合结果和进行中的同键任务；游戏重启后失效，首期不写入浏览器持久化存储。
_避免使用_：持久化缓存、磁盘缓存、localforage 缓存

## 后续方向

**组件组**：
未来可能用于容纳同一语义部件的多个变体，例如 `face`。当前只有结构方向，没有首期运行时语义。

**组件变体**：
组件组内可替换的候选部件，例如 `face.smile`、`face.sad`。默认值、预设引用和脚本切换方式尚未确定。
