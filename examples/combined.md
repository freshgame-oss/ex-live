---
title: ex-live · 说明与动态一起输出
subtitle: 一份源稿，两个视角
lang: zh
template: doc
theme: ex-live
mode: light
style: strict
---
说明讲清楚结论，动态面板展示流程。两部分共用一份源稿，可以一起分享。

## A 如何阅读

先看说明，再看下方动画。动态画面第一帧就有完整结构，连线和状态持续变化。

- 说明页负责结论、依据和取舍。
- 动态面板负责展示模块与流转关系。
- 本页是功能示例，动画状态与计数均为模拟。

## B 一份源稿如何生成两个视角

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
        {"t": "理清内容", "m": "统一模块名称与关系", "g": "内容准备"},
        {"t": "生成说明", "m": "按简化技术中文组织说明", "g": "说明视角"},
        {"t": "驱动状态", "m": "按时间更新画面状态", "g": "动态视角"},
        {"t": "合并交付", "m": "同页展示并保留独立面板", "g": "组合交付"}
      ],
      "log": {"who": "演示", "c": "gr"}
    },
    "count": {"type": "counter", "start": 0, "rate": 1}
  },
  "elements": [
    {"type": "text", "x": 0, "y": 72, "w": 1000, "align": "center", "t": "当前演示：{step}", "c": "gr", "b": true},
    {"type": "box", "x": 340, "y": 110, "w": 320, "h": 90, "color": "cy",
      "lines": [{"t": "一份源稿", "b": true, "c": "cy"}, "说明文字 + 动态配置"],
      "when": {"var": "step.i", "eq": 0}, "then": {"glow": "cy"}},
    {"type": "box", "x": 100, "y": 285, "w": 320, "h": 100, "color": "bl",
      "lines": [{"t": "说明视角", "b": true, "c": "bl"}, "结论 · 依据 · 取舍"],
      "when": {"var": "step.i", "eq": 1}, "then": {"glow": "bl"}},
    {"type": "box", "x": 580, "y": 285, "w": 320, "h": 100, "color": "pu",
      "lines": [{"t": "动态视角", "b": true, "c": "pu"}, "模块 · 连线 · 状态"],
      "when": {"var": "step.i", "eq": 2}, "then": {"glow": "pu"}},
    {"type": "box", "x": 340, "y": 470, "w": 320, "h": 100, "color": "gr",
      "lines": [{"t": "组合交付", "b": true, "c": "gr"}, "主页面 + 独立动态页", {"t": "演示计数：{count}", "c": "dim", "size": 16}],
      "when": {"var": "step.i", "eq": 3}, "then": {"glow": "gr"}},
    {"type": "path", "points": [[500,200],[500,240],[260,240],[260,285]], "color": "bl", "r": 8,
      "flow": {"period": 2, "offsets": [0,1], "color": "bl"}},
    {"type": "path", "points": [[500,200],[500,240],[740,240],[740,285]], "color": "pu", "r": 8,
      "flow": {"period": 2, "offsets": [0.5,1.5], "color": "pu"}},
    {"type": "path", "points": [[260,385],[260,425],[500,425],[500,470]], "color": "gr", "r": 8,
      "flow": {"period": 2.5, "offsets": [0,1.25], "color": "gr"}},
    {"type": "path", "points": [[740,385],[740,425],[500,425],[500,470]], "color": "gr", "r": 8,
      "flow": {"period": 2.5, "offsets": [0.6,1.8], "color": "gr"}},
    {"type": "log", "x": 50, "y": 615, "w": 900, "rows": 2, "title": "演示日志", "padTop": 10, "padBottom": 18,
      "cols": [{"key":"time","x":0},{"key":"who","x":120},{"key":"m","x":200},{"key":"g","x":650}]}
  ]
}
```

按钮可以暂停或继续。系统开启减少动画时，页面先展示静止画面。

## C 如何修改和分享

1. 修改源稿中的说明或动态配置。
2. 重新生成主页面与独立面板。
3. 检查文字、布局和状态变化。
4. 分享主 HTML 文件。

主文件内嵌完整动画，复制到另一台电脑仍可打开。独立动态页方便单独展示。

## D 能力边界

动态面板展示预设流程，不接入真实监控数据。静态说明与动态模拟要明确区分。

普通组合 HTML 不需要在线配音。动态 MP4 按需导出，旁白讲解使用独立的视频模式。
