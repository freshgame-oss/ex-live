# ex-live

一次调用，默认交付说明页面和 live-panel 动态面板。主页面内嵌动画，也导出独立动态页面。用简化技术中文讲清楚结论，用完整架构图展示持续变化的状态。

## 适用场景

当你需要解释复杂的架构、流程或状态变化时：

- **说明视角**：用清晰的 Markdown 讲清楚结论、依据和取舍。
- **动态视角**：用一个内嵌的 `live-panel` JSON 围栏画出模块和流转关系。
- **组合交付**：生成一份主 HTML 和一份独立动态 HTML，支持完全离线分享。

## 依赖要求

| 功能 | 依赖要求 |
| --- | --- |
| 生成 HTML | Node.js 22+（必需） |
| 阅读产物 | 现代浏览器（必需） |
| 自动帧检查 | Python 3 + 兼容 Chrome DevTools 的浏览器（可选） |
| 动态 MP4 导出 | 自动帧检查环境 + ffmpeg（可选） |

生成 HTML 无须安装 npm 依赖，也无须 API Key。缺少可选依赖时仍能交付完整 HTML。未执行的自动检查或 MP4 导出会如实报告。

## 安装技能

ex-live 是一个自包含的技能包。源码仓库为 [freshgame-oss/ex-live](https://github.com/freshgame-oss/ex-live)。
你有两种方式安装：

**方式一：作为独立技能复制**

将整个 `ex-live` 目录复制到宿主的技能目录。例如，支持共享技能的宿主可放在 `~/.agents/skills/ex-live/`。

**方式二：在 Pi 中安装**

```bash
pi install git:github.com/freshgame-oss/ex-live
```

本地开发时，先克隆仓库，再加载本地目录：

```bash
git clone https://github.com/freshgame-oss/ex-live.git /绝对路径/ex-live
pi install /绝对路径/ex-live
```

远端安装和本地安装二选一，避免重复加载。在 Pi 会话中执行 `/reload`，然后调用：

```text
/skill:ex-live 解释这个系统，用 warm 模板展示任务流转。
```

## 开始使用

### 1. 准备内容

准备一份包含说明文字和一个 `live-panel` 围栏的 Markdown 文件。参考 [README 动态源稿](examples/readme.md)。
说明文档默认使用 `template: doc`、`theme: ex-live`、`mode: light`。动态配置默认使用 `theme.preset: warm-paper`，支持暂停/继续。

### 2. 渲染页面

**生成 HTML：**

```bash
node /绝对路径/ex-live/scripts/ex-live.mjs render "源稿.md" --style strict --no-open -o "输出.html"
```

**连带导出 MP4 视频（需选配依赖）：**

```bash
node /绝对路径/ex-live/scripts/ex-live.mjs render "源稿.md" --style strict --no-open --mp4 -o "输出.html"
```

### 3. 数据与产物结构

系统默认数据根目录为 `~/.ex-live/`。如果需要修改数据目录，可通过指定 `EX_LIVE_HOME` 环境变量：

```bash
EX_LIVE_HOME=/自定义绝对路径/data \
  node /绝对路径/ex-live/scripts/ex-live.mjs render /绝对路径/源稿.md --style strict --no-open
```

数据目录内的结构：

- `pages/`：默认存放说明 HTML、源稿、动态文件与动态 MP4。
- `videos/`：默认存放旁白讲解 HTML 与可选 MP4。
- `config.json`：ex-live 配置。
- `cache/tts/`：语音缓存。

指定 `-o` 时，产物保存在指定位置。包含动态面板的稿件会生成：

- `<产物>.html`：主页面，包含说明与内嵌动画。
- `<产物>.md`：生成时依据的源稿。
- `<产物>-live.html`：独立的动态面板页面。
- `<产物>-live.json`：面板配置的纯 JSON。

指定 `--mp4` 时另存 `<产物>-live.mp4`。纯说明稿只生成 HTML。
主 HTML 内嵌完整动画，可以单文件离线分享。

### 4. 修补与视频解说

**修补说明或动态配置：**

修补从主 HTML 源稿重新生成全部对应产物。其他文件被单独修改时拒绝并保留文件。
MP4 只有追加 `--mp4` 时才会更新。

```bash
node /绝对路径/ex-live/scripts/ex-live.mjs patch "<产物>.html" --panel "<标题或ID>" --from "<替换面板>.md" --style strict --no-open
```

**带旁白的讲解视频：**

旁白视频使用 `video` 模式生成，不支持 `live-panel` 围栏，动态视频与旁白不同步。
`auto` 可能使用 ElevenLabs 外发，本地语音或不能外发的内容请使用 `system` 或 `off`。

```bash
node /绝对路径/ex-live/scripts/ex-live.mjs video "视频稿.md" --style strict --voice system --no-open -o "视频.html"
```

## 局限与注意事项

- 动态面板仅展示你声明的流转逻辑，不直接读取真实系统监控数据。如果数字和状态均为模拟，请在文字和面板中明确标注。
- 每个 Markdown 文件仅支持一个 `live-panel` 围栏。
- 减少动画偏好默认会暂停动画播放。

_关于开源许可及第三方引用，请参见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。_
