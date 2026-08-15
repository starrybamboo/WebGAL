# 统一 Figure 面部运行时

Character 位图 Figure 的眨眼与口型由一个瞬态 `FigureFaceRuntime` 统一拥有：语音轨道和眨眼轨道独立生成 `0..1` 信号，运行时在同一时刻将它们合成为原子的 `FacePose`，再由位图面部适配器呈现。这样可以让文本与语音共用一套计时、替换、停止和销毁语义，同时避免把三档眼睛与三档嘴巴扩展成组合状态机。

运行时以 Figure Target 为身份。Figure 附着时取得面部适配器并开始独立眨眼，文本或语音通过 token-scoped speech lease 提供嘴巴轨道；新的附着或说话租约取代旧租约，过期释放和迟到的异步语音分析不得影响新状态。语音轨道异步预分析整句 PCM 包络并按媒体 `currentTime` 随机访问；分析尚未完成或失败时，同样按 `currentTime` 使用确定性三档时间轴，不能因此阻塞播放或让整句永久闭嘴。文本轨道按文字、标点与台词时长生成确定性信号，非标点短句在同步首帧即进入半开。说话停止只释放嘴通道的覆盖权；Figure 开始逻辑退场时按实例 UUID 立即释放眨眼与适配器，使退场旧实例不再占用原 Figure Target。面部姿态、租约、计时器、解码结果和适配器均不写入 StageState 或存档；失败只降级对应 Figure 的面部呈现，不阻塞语音、Figure 主链、剧本或读档。

位图适配器消费 ADR 0057 的 `facialRig`，把眼睛与嘴的连续值分别量化为底图、半帧和完整替换片；嘴型量化使用迟滞，并要求闭合与全开之间经过半开。`Facial Rig` 仍只指 Character 位图资源。Live2D 与 Spine 明确留在本运行时范围之外：其现有模型参数、插件时钟及 `changeFigure -blink` 行为不变。

旧 `changeFigure` 整图参数 `mouthOpen`、`mouthClose`、`mouthHalfOpen`、`eyesOpen`、`eyesClose` 和 `animationFlag` 以及对应 `figureAssociatedAnimation` 状态已删除，不提供兼容层。整图协议无法原子表达闭眼与张嘴的组合，保留它会恢复两套时序、渲染与清理路径；普通图片、Live2D、Spine 资源路由及 Live2D 的 `motion`、`expression`、`blink`、`focus` 等模型参数仍保持原有目标语义。
