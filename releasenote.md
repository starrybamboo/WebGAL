## 发布日志

**本仓库发布源代码，并在 Release 中附带 WebGAL 引擎网页版压缩包。**

**如果你想要体验使用便捷的图形化编辑器创建、制作并实时预览 WebGAL 游戏，请 [下载 WebGAL 图形化编辑器](https://github.com/OpenWebGAL/WebGAL_Terre/releases)。**

### 在此版本中

#### 新功能

新增场景调用传值。调用场景时可以传入数据，被调用的场景可以提前结束并把结果返回给调用处。

新增只在当前场景内有效的变量，场景结束后自动消失。

立绘新增左侧 1/4、左侧 1/3、右侧 1/3、右侧 1/4 四个位置，对话时的立绘高亮同样支持。

较长的语句可以分成多行书写，效果与写成一行相同。

支持 opus 格式的音频。

优化动画衔接。登场动画与后续动画的过渡更自然，同一对象上后写的动画会覆盖先写的动画，快进预览的效果与实际游玩一致。

#### 修复

修复流程图中未解锁的支线仍会显示的问题。

修复对话中出现方括号时后续文字可能不显示的问题。

修复效果设置填写不完整时画面可能停止刷新的问题。

修复快进预览时连续执行的语句画面效果可能不正确的问题。

修复部分变量名取值结果不正确的问题。

<!-- English Translation -->
## Release Notes

**This repository releases source code and includes a WebGAL engine web package in each Release.**

**If you want to create, edit, and preview WebGAL games with a graphical editor, please [download the WebGAL graphical editor](https://github.com/OpenWebGAL/WebGAL_Terre/releases).**

### In this version

#### New Features

Added value passing for scene calls. Data can be passed into a called scene, and a called scene can end early and return a result to the caller.

Added variables that are valid only inside the current scene and disappear when the scene ends.

Added four figure positions: left 1/4, left 1/3, right 1/3, and right 1/4, also supported by dialogue figure highlighting.

Longer statements can be written across several lines, with the same result as writing them on one line.

Added support for opus audio.

Improved animation transitions. Entrance animations flow more naturally into following animations, a later animation on the same object replaces the earlier one, and fast preview matches actual playback.

#### Fixes

Fixed locked routes still being shown in the flowchart.

Fixed text after a square bracket in dialogue possibly not being displayed.

Fixed the screen possibly stopping updates when an effect setting is incomplete.

Fixed incorrect on-screen results for statements running in a row during fast preview.

Fixed some variable names returning incorrect values.

<!-- Japanese Translation -->
## リリースノート

**このリポジトリではソースコードを公開し、Release には WebGAL エンジンの Web 版パッケージも同梱しています。**

**グラフィカルエディターで WebGAL ゲームを作成、編集、リアルタイムプレビューしたい場合は、[WebGAL グラフィカルエディターをダウンロードしてください](https://github.com/OpenWebGAL/WebGAL_Terre/releases)。**

### このバージョンについて

#### 新機能

シーン呼び出しの値の受け渡しを追加しました。呼び出すシーンにデータを渡せるほか、呼び出されたシーンは途中で終了して結果を呼び出し元に返せます。

現在のシーンの中だけで有効な変数を追加しました。シーンが終わると自動的に消えます。

立ち絵の位置に左 1/4、左 1/3、右 1/3、右 1/4 を追加しました。会話時の立ち絵ハイライトも対応しています。

長い文を複数行に分けて書けるようになりました。1 行で書いた場合と結果は同じです。

opus 形式の音声に対応しました。

アニメーションの繋がりを改善しました。登場アニメーションから次のアニメーションへの移行が自然になり、同じ対象では後から指定したアニメーションが前のものを置き換え、早送りプレビューが実際のプレイと一致します。

#### 修正

フローチャートで未解放のルートが表示される問題を修正しました。

会話に角括弧が含まれると、その後の文字が表示されないことがある問題を修正しました。

演出の設定が不完全な場合に、画面の更新が止まることがある問題を修正しました。

早送りプレビューで連続して実行される文の画面表示が正しくないことがある問題を修正しました。

一部の変数名で値が正しく取得できない問題を修正しました。
