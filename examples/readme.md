---
title: ex-live · 组合交付演示
subtitle: Markdown 说明与 live-panel 动态面板
lang: zh
template: doc
theme: ex-live
mode: light
style: strict
---

ex-live 是一套能把说明文档和动态面板结合起来的工具。这页演示了从“源稿”到“两份视角”的转化过程。

## 如何使用

- **入口**：在会话中输入 `/skill:ex-live` 触发任务。
- **生成命令**：`node /绝对路径/ex-live/scripts/ex-live.mjs render /绝对路径/源稿.md --style strict --no-open`
- **输出目录**：默认输出到 `~/.ex-live/pages/`。生成的主页面与独立面板无需网络即可直接查看。

## 核心概念

通过一份包含纯文本和 JSON 的源文件，你可以一次性产出两类内容：

1. **主说明页**：解释目标、原因和结论，就是你当前在看的格式。
2. **动态面板**：展示状态流动，第一帧即全貌。支持暂停和继续，用户减少动画偏好开启时默认暂停。

## 处理流程 (模拟数据)

下面这个动画展示了 ex-live 的工作过程。它从一份源稿中分出文字和配置，送到说明渲染器和状态引擎，最后生成包含动画的离线页面。

> 动画中展示的进度数字和日志信息均为功能演示用的模拟数据。

```live-panel
{
  "meta": {"title": "ex-live · 生成流程（模拟）", "lang": "zh-CN"},
  "canvas": {"width": 1000, "height": 760, "duration": 24, "fps": 30},
  "theme": {"preset": "warm", "fontSize": 20, "lineHeight": 28},
  "titlebar": {"text": "ex-live · 说明与动态一起输出"},
  "clock": {"start": "09:00:00", "rate": 1},
  "credit": {"text": "功能示例 · 状态、时钟和计数均为模拟", "y": 735},
  "machines": {
    "step": {
      "type": "cycle", "period": 3,
      "values": [
        {"t": "源稿就绪", "m": "包含文字与 JSON", "g": "内容准备"},
        {"t": "渲染说明", "m": "生成静态技术文档", "g": "说明视角"},
        {"t": "驱动面板", "m": "解析 live-panel 状态", "g": "动态视角"},
        {"t": "组合交付", "m": "主页与独立页一起输出", "g": "组合交付"}
      ],
      "log": {"who": "演示", "c": "gr"}
    },
    "count": {"type": "counter", "start": 0, "rate": 1}
  },
  "elements": [
    {"type": "text", "x": 0, "y": 72, "w": 1000, "align": "center", "t": "当前步骤：{step}", "c": "gr", "b": true},
    {"type": "box", "x": 340, "y": 110, "w": 320, "h": 90, "color": "cy",
      "lines": [{"t": "Markdown 源稿", "b": true, "c": "cy"}, "说明文字 + 动态配置"],
      "when": {"var": "step.i", "eq": 0}, "then": {"glow": "cy"}},
    {"type": "box", "x": 100, "y": 285, "w": 320, "h": 100, "color": "bl",
      "lines": [{"t": "说明视角", "b": true, "c": "bl"}, "排版明确的技术文档"],
      "when": {"var": "step.i", "eq": 1}, "then": {"glow": "bl"}},
    {"type": "box", "x": 580, "y": 285, "w": 320, "h": 100, "color": "pu",
      "lines": [{"t": "动态视角", "b": true, "c": "pu"}, "模块 · 连线 · 持续更新"],
      "when": {"var": "step.i", "eq": 2}, "then": {"glow": "pu"}},
    {"type": "box", "x": 340, "y": 470, "w": 320, "h": 100, "color": "gr",
      "lines": [{"t": "组合产物", "b": true, "c": "gr"}, "单文件离线 HTML", {"t": "演示计数：{count}", "c": "dim", "size": 16}],
      "when": {"var": "step.i", "eq": 3}, "then": {"glow": "gr"}},
    {"type": "path", "points": [[500,200],[500,240],[260,240],[260,285]], "color": "bl", "r": 8,
      "flow": {"period": 2, "offsets": [0,1], "color": "bl"}},
    {"type": "path", "points": [[500,200],[500,240],[740,240],[740,285]], "color": "pu", "r": 8,
      "flow": {"period": 2, "offsets": [0.5,1.5], "color": "pu"}},
    {"type": "path", "points": [[260,385],[260,425],[500,425],[500,470]], "color": "gr", "r": 8,
      "flow": {"period": 2.5, "offsets": [0,1.25], "color": "gr"}},
    {"type": "path", "points": [[740,385],[740,425],[500,425],[500,470]], "color": "gr", "r": 8,
      "flow": {"period": 2.5, "offsets": [0.6,1.8], "color": "gr"}},
    {"type": "log", "x": 50, "y": 615, "w": 900, "rows": 2, "title": "处理日志", "padTop": 10, "padBottom": 18,
      "cols": [{"key":"time","x":0},{"key":"who","x":120},{"key":"m","x":200},{"key":"g","x":650}]}
  ]
}
```

## 离线与兼容

生成后，页面框架、动画与脚本均可离线运行。现代浏览器可直接打开；系统开启减少动画时默认暂停。
