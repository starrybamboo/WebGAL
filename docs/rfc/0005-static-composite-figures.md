# RFC 0005：WebGAL 角色管理与静态组合立绘

- **状态：** 已实现（本地维护分支）
- **目标版本：** WebGAL 主分支（以 4.6.2 立绘行为为基线）
- **Issue：** <https://github.com/OpenWebGAL/WebGAL/issues/1010>
- **方向修正：** <https://github.com/OpenWebGAL/WebGAL/issues/1010#issuecomment-5078678535>
- **本地研究记录：** [issue-1010.md](../research/issue-1010.md)

> `composeFigure` Demo、`-composite` 参数为个人维护的立绘合成分支的实验性命令，如果看到请无视~~

## 摘要

本 RFC 为 WebGAL 引入以“角色”为目标对象的管理机制，并把静态组合立绘作为角色模板的一项能力。作者在单个角色目录中以 `figure.json` 声明画布、静态位图部件和组合预设；剧本使用新的 `character` 命令操作角色，并在内容中直接写角色名与有序组合列表：

```webgal
character: yuki/summer_uniform,face_smile -left;
```

同名角色在舞台上只能同时存在一个。`character` 对外管理角色，底层仍复用 figure 的变换、效果和动画机制；静态组合完成后生成一张普通底图，再把普通图像与可选的位图 Facial Rig 交给既有 figure 控制系统。只有 Character 位图的口型和眨眼由瞬态面部运行时驱动；Live2D 与 Spine 不接入。

## 已确认的方向修正

Issue 评论对原始 RFC 作出以下覆盖性修正：

1. 正式脚本入口改为新的 `character` 命令，管理对象是角色，不再通过扩展 `changeFigure` 表达角色管理。
2. 同名角色在舞台上唯一；后续 `character: yuki` 继续操作现有 `yuki`，而不是创建第二个同名对象。
3. 首期不实现浏览器持久化缓存，不提供 `localforage` 缓存、WebP 写入、持久化开关或清理按钮。
4. 角色模板和组合图像加载采用现有立绘网络请求的非阻塞策略，即使图像尚未就绪，也不阻塞读档或游戏流程。
5. `figure.json` 只作为角色组合定义的输入；组合完成后按普通图像进入 figure 系统，不把模板 JSON 当作立绘资源。
6. `components.<group>.<variant>` 是为后续单独切换表情等部件预留的方向，当前只有结构草案，没有完整语义。
7. 正式选择语法为 `character: <角色名>/<组合项>[,<组合项>...];`，不使用评论示例中的 `-preset` 参数。

## 本地分支背景

本地维护分支与 WebGAL 主分支并不完全一致，包含 `composeFigure` 等个人维护的实验代码。正式实现以主分支与本 RFC 为准：

- `composeFigure`、`-composite` 及其解析、缓存和测试可以删除。
- 不为这些实验命令设计兼容或迁移路径。
- 其他本地私有代码不因本 RFC 自动删除；实施时必须逐项判断是否与新角色模型冲突。

## WebGAL 4.6.2 基线观察

以下内容来自 4.6.2 的现有实现，只说明新方案必须处理的约束，不代表本 RFC 已经选定实现方式：

- `changeFigure` 不带 `-id` 时使用 `fig-left`、`fig-center`、`fig-right` 三个位置目标；带 `-id` 时改用以该 ID 为键的自由立绘。若 `character` 要让角色身份独立于位置，就不能直接把角色身份等同于这三个位置槽位。
- 现有 `changeFigure` 在资源 URL 变化时会清除该目标的效果与动画设置，再按新立绘建立默认状态。角色切换预设是否也应重置这些状态，需要单独决定，不能只因为底层复用 figure 就默认继承现有行为。
- 普通图片立绘会先进入舞台状态并创建目标容器，再异步加载纹理；脚本流程不会等待图片完成。组合立绘也应保持非阻塞，但“旧图何时退出、空容器何时建立、组合完成后何时开始入场动画”仍需定义。
- 现有资源扫描和预取直接读取 `changeFigure` 脚本中的资源 URL。`character: yuki/summer_uniform,face_smile` 只暴露角色名和组合项名称；若要预取模板部件或预先合成，必须新增理解角色模板的扫描或预热阶段。

## 目标

- 以角色名建立稳定的舞台管理对象，同名角色只能存在一个。
- 让 `character` 尽可能复用现有 figure 的位置、变换、效果和动画能力。
- 以简单的有序叠加语义表达静态组合，不引入槽位替换或隐式去重。
- 把组合结果预先合成为普通图像，保持 figure 渲染和演出底层稳定。
- 保留本轮进程内复用和预热空间，避免重复合成相同组合。
- 让 Terre 提供角色模板与 `character` 命令的编辑能力。

## 首期非目标

- 不实现浏览器持久化缓存、磁盘缓存、WebP 编码、玩家缓存设置或缓存清理。
- 不支持单独切换表情、服装等部件；组件变体仅作为后续兼容方向。
- 不提供通用部件树或脚本局部替换命令；只支持模板预声明的眼睛、嘴矩形替换层。
- 不合成 GIF、APNG、视频、SVG、Live2D 或 Spine，也不组合多个动态模型。
- 不实现本轮缓存的 LRU、内存池或容量回收策略。
- 不通过运行时文件监听发现 Terre 外的资源变化。
- 不在本 RFC 中锁定共享规则包、发布方式或 Node 指纹工具。

## 领域模型

### 角色

`character` 命令直接管理的舞台对象。角色名是舞台唯一身份；位置和底层 figure 目标是角色当前状态，不是角色身份本身。

### 角色模板

角色目录内的 `figure.json`。它声明角色可用的静态部件、组合预设和顶层回退画布，是合成输入，不直接进入 figure 控制系统。

### 组合预设

角色模板内命名的有序部件列表。旧预设可直接写成数组；对象预设还可声明独立画布。预设可复用其他预设；展开后的顺序决定绘制顺序。

### 组合结果

按模板和预设生成的一张普通底图，默认表示睁眼与闭嘴。底图进入 figure 控制系统，继续参与位置、变换、效果和动画处理；可选面部 rig 作为同一 Figure 实例的附属运行时描述交付，不进入 StageState 或存档。

### 面部替换区

绑定到最终组合画布的可选眼睛、嘴矩形和小型静态替换片。`Facial Rig` 只描述 Character 位图资源，不是 Live2D 骨骼、面部运行时或通用部件树。

### Figure 面部运行时

附着于 Character 位图 Figure Target 的瞬态面部行为所有者。语音轨道和眨眼轨道分别产生嘴巴张开度与眼睛睁开度，运行时把它们合成为同一个原子面部姿态，再交给位图面部适配器；运行时对象和当前姿态不进入 StageState 或存档。

## 角色模板格式

角色模板暂沿用原 RFC 的目录约定：

```text
game/figure/<角色名>/figure.json
```

首期静态组合结构：

```json
{
  "Version": 1,
  "fingerprint": "6a7f9b7d1c4f5c4cb9c6b5e45d6fdf41f5bce4f0ddcfd482b8ba8541a357fb90",
  "canvas": {
    "width": 1600,
    "height": 3000
  },
  "components": {
    "body": {
      "src": "body.webp",
      "x": 0,
      "y": 0,
      "scale": 1
    },
    "uniform_summer": {
      "src": "parts/uniform-summer.webp",
      "x": 0,
      "y": 0,
      "scale": 1
    },
    "face_smile": {
      "src": "faces/smile.webp",
      "x": 0,
      "y": 0,
      "scale": 1
    }
  },
  "presets": {
    "summer_uniform": ["body", "uniform_summer"],
    "summer_uniform_smile": {
      "canvas": {
        "width": 832,
        "height": 1216
      },
      "items": ["summer_uniform", "face_smile"]
    }
  }
}
```

顶层 `canvas` 是直接选择部件与旧数组预设的兼容回退。对象预设使用 `{ "canvas": ..., "items": [...] }` 声明自己的画布，使同一个角色模板中的不同立绘组可以各自采用默认底图的裁剪后尺寸。一次组合选择不得混用多个不同的预设画布。原 RFC 已确认的相对路径、静态位图、固定 `x/y/scale`、递归展开、顺序叠加、重复引用和循环校验规则继续保留。是否保留 `fingerprint` 为 V1 必填字段、如何计算它，因首期移除持久化缓存而需要重新评估。

对象预设还可以声明与自身画布绑定的 `facialRig`：

```json
{
  "presets": {
    "live": {
      "canvas": { "width": 1024, "height": 1536 },
      "items": ["base"],
      "facialRig": {
        "eyes": {
          "x": 485,
          "y": 228,
          "width": 168,
          "height": 113,
          "half": "eyes-half.png",
          "closed": "eyes-closed.png"
        },
        "mouth": {
          "x": 531,
          "y": 317,
          "width": 82,
          "height": 73,
          "halfOpen": "mouth-half.png",
          "open": "mouth-open.png"
        }
      }
    }
  }
}
```

矩形使用最终组合画布左上角坐标，且必须完全位于画布内。睁眼、闭嘴直接使用组合底图；`closed` 与 `open` 是对应分支必需片，`half` 与 `halfOpen` 可省略。直接部件选择和旧数组预设可以使用顶层 `facialRig` 回退；对象预设一旦声明自己的画布或 rig，就不再隐式继承顶层 rig。

## 后续组件变体方向

为以后只切换表情等部件，Issue 评论建议让一个组件组包含多个变体：

```json
{
  "components": {
    "face": {
      "smile": {
        "src": "faces/smile.webp",
        "x": 0,
        "y": 0,
        "scale": 1
      },
      "sad": {
        "src": "faces/sad.webp",
        "x": 0,
        "y": 0,
        "scale": 1
      }
    }
  }
}
```

该结构目前只是兼容性方向。默认变体、预设引用方式、组顺序、空选择、脚本切换语法、缓存键和是否需要新 `Version` 均未确定，首期不得自行推导实现。

## `character` 脚本

当前确认的最小形式是：

```webgal
character: yuki/summer_uniform,face_smile -left;
```

- `/` 前的 `yuki` 标识角色，并关联 `game/figure/yuki/figure.json`。
- `/` 后是逗号分隔的有序组合项列表；每项可以引用模板中的静态部件或组合预设。
- 组合预设在其引用位置递归展开，最终展开顺序就是图层叠加顺序，重复项保留。
- 同名角色只能在舞台存在一个；再次调用更新该角色。
- `-left`、`-right` 及 figure 的其他变换、效果和动画能力应尽可能复用。
- 角色组合完成后，底层以普通图像调用 figure 控制系统。
- 普通 `changeFigure` 继续服务既有立绘脚本；不再承担正式的角色组合语法。

一般形式为：

```text
character: <角色名>/<组合项>[,<组合项>...] [figure 参数...];
```

当前实现语义：

- 每条非清除 `character` 都必须重新声明完整组合列表；不带 `/组合列表` 的命令不会隐式沿用或恢复组合。
- `-id` 与命名位置沿用普通 Figure Target 选择；同名 Character 来源迁移到新目标前先从旧目标移除。
- 同一角色换目标或换组合沿用上游 Figure 的非阻塞交叉切换，旧容器可以退场，新容器在资源就绪后入场。
- `character: <角色名> -clear;` 清除指定角色来源，`character:none;` 清除全部 Character 来源；普通 `changeFigure` 写入同一目标时按普通替换处理。
- `character` 只委托静态 Figure 通用参数；Live2D、Spine 专属参数被过滤，位图面部资源只能来自模板 `facialRig`。

## 渲染与 figure 边界

静态组合仍采用普通 `source-over` 顺序叠加：后出现的部件绘制在先出现的部件之上，重复项保留，越出组合画布的内容裁剪。输出尺寸优先等于所选对象预设的画布，否则等于模板顶层回退画布，并保留透明通道。

`character` 层负责角色身份、模板解析、组合选择和异步准备；脚本参数直接委托 OpenWebGAL dev 的 `changeFigure`，不另建通用 Figure 演出模块。只有稳定来源描述到最终普通图像的异步解析占用一个 Character source adapter seam；普通图片、Live2D、Spine 继续执行上游 `changeFigure → StageState → Pixi sync → animation` 主链。

当模板带 `facialRig` 时，Character source adapter 在普通图像旁交付解析后的替换片 URL。位图面部适配器在同一 Figure 容器中创建眼睛、嘴 Sprite，因此所有 Figure 变换、滤镜和进退场仍只有一套实现；它只负责资源与量化，不拥有时间。Live2D 与 Spine 不创建该适配器。

统一 Figure 面部运行时在 Figure 附着期间持续运行独立眨眼轨道，并在说话租约存在时采样语音媒体时间线或文本时间线。音频 PCM 分析等待或失败时继续使用按媒体 `currentTime` 随机访问的确定性三档时间轴，短文本则在同步首帧进入口型。眼嘴合成后一次提交，停止说话只恢复闭嘴而不停止眨眼；Figure 开始逻辑退场时按实例 UUID 立即释放附着、计时器与适配器，避免旧退场对象继续占用原 target。迟到的异步语音分析和旧租约释放不得影响新 Figure 或新语音，任一面部失败只做 best-effort 降级，不阻塞主链。

普通 `changeFigure -blink` 继续由 Live2D 原有路径处理，不进入 Character 位图面部运行时。旧整图 `mouthOpen`、`mouthClose`、`mouthHalfOpen`、`eyesOpen`、`eyesClose`、`animationFlag` 及其持久化关联动画状态已删除，不提供兼容层。

`figure.json` 不作为 figure 的 URL，因此不需要依赖普通 `.json` 立绘的 Live2D 判定来识别角色模板。

## 加载、预热与本轮缓存

- 首期只保留本轮进程内的组合结果复用，不写入浏览器持久化存储。
- 相同模板与相同组合的并发请求应共享同一个加载/合成任务，避免重复工作。
- 若首期实现预热，应扩展资源扫描，使其先取得并缓存角色模板，再根据后续 `character` 语句的预设引用安排部件预取和低优先级合成；现有预取器无法仅凭角色名直接发现这些部件。
- 快进期间，过期组合结果不得覆盖同一角色的最新请求。
- 读档、首次显示和普通脚本执行均不等待组合完成；游戏流程与现有立绘网络请求一样继续推进。

非阻塞加载沿用 Figure 主链的交叉切换：旧容器可以继续退场，目标逻辑状态立即更新；首次加载在组合资源交付前不阻塞脚本，失败只记录错误且不会恢复已被后续命令取代的来源。

## 存档与状态恢复

存档保存足以恢复 Character 来源描述、位置和 Figure 演出状态的逻辑数据；Live2D `-blink` 作为模型时序配置继续保存。临时 Blob URL、运行时纹理、FacePose、语音/眨眼轨道、计时器和面部适配器都不进入存档。

恢复舞台时立即恢复游戏流程，并异步重建角色组合。单个角色加载或合成失败不得中止整个读档，也不得阻塞后续脚本执行。

## Terre 交付方向

- `figure.json` 继续作为角色模板专用资源，由角色模板编辑器维护画布、部件、预设和预览。
- 剧本编辑器应提供 `character` 命令面板，而不是为 `ChangeFigure` 增加正式组合模式。
- 保存和导出仍需校验模板与引用资源。
- 模板保存后的预览失效、组件变体编辑和共享规则实现方式仍需在角色 ABI 确定后确认。

## 建议：共享规则实现

建议让引擎与 Terre 复用行为一致的模板校验、预设展开和缓存规范化规则。是否通过版本化 TypeScript 包、共享源码或其他方式交付，留待实施评估，不作为当前 RFC 的硬性前提。

## 兼容性与迁移

- 既有 `changeFigure` 对普通图片、Live2D 和 Spine 的资源路由保持原行为；Live2D `-blink` 保留在其原有模型路径。
- 旧整图 `mouthOpen`、`mouthClose`、`mouthHalfOpen`、`eyesOpen`、`eyesClose` 与 `animationFlag` 删除；对应素材需迁移到 Character `facialRig`，Live2D 继续使用模型参数。
- 新的 `character` 是独立脚本入口，不把 `figure.json` 传给普通立绘解析器。
- 本地 `composeFigure` Demo、`-composite` 参数及相关代码删除，不进入主分支兼容范围。
- 原 RFC 中以 `changeFigure` 作为组合入口、允许同一角色模板多目标并存、持久化缓存和阻塞读档的内容均被 Issue 评论覆盖，不再作为实现依据；`<角色名>/<组合列表>` 选择形式迁移到新的 `character` 命令，不为旧命令提供兼容入口。

## 剩余问题

1. 本轮组合缓存是否需要容量上限，以及预热并发与取消策略是否需要进一步收紧。
2. 组件变体是否进入下一版模板 ABI；若后置，扁平 `components` 如何保证未来可迁移。
3. Terre 角色模板编辑器、`character` 面板和预览同步的交付节奏。
4. 首期没有持久化缓存后，`fingerprint` 是否仍应是模板必填字段。

## 当前实现状态

1. `character` 的同名来源唯一性、Figure Target 委托、清除语义和存档形状已经落地。
2. 模板 V1 的画布、部件尺寸模式、预设作用域与 `facialRig` 校验已经落地；组件变体仍后置。
3. 角色模板解析、静态合成、进程内任务去重、非阻塞交付与过期结果隔离已经落地。
4. Character 位图面部运行时、语音/眨眼轨道与位图面部适配器已经落地；Live2D、Spine 未接入，旧整图面部参数和关联动画状态已经删除。
5. Terre 的角色模板和 `character` 编辑体验仍按其独立交付计划推进。

## 结论

当前实现不再只是“给 `changeFigure` 增加组合语法”，而是让 `character` 通过稳定来源描述复用现有 Figure Target 主链。静态组合负责生成普通图像，Figure 继续负责实际演出；位图面部运行时以独立语音/眨眼轨道驱动 Character Facial Rig，Live2D 与 Spine 保持原路径，且所有位图面部运行态保持非持久化。首期只做本轮组合缓存且绝不阻塞游戏流程，组件级切换继续作为后续方向。
