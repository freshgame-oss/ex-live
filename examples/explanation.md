---
title: ex-live：清楚说明，再生成页面
subtitle: 纯说明页示例
template: sheet
theme: ex-live
lang: zh
style: strict
cols: 2
---
用户说「用 ex-live」时，默认使用简化技术中文。页面仍由原渲染器生成。

## A 使用方式

```flow TB
[用户请求] -> [简化技术中文稿]: 整理内容
[简化技术中文稿] -> [内容审阅]: 核对表述
[内容审阅] -> [ex-live 渲染器]: 生成页面
[ex-live 渲染器] -> [单文件 HTML]: 交付结果
```

`ex-live` 默认组合说明和动态面板。本页仅展示文字规则和静态组件。

## B 写作要求

| 内容 | 要求 |
| --- | --- |
| 结论 | 第一句回答核心问题 |
| 术语 | 同一概念使用同一个词 |
| 步骤句 | 最多 30 字 |
| 描述句 | 最多 40 字 |
| 证据 | 写明来源与核验范围 |

代码、命令和原样引文保持原文。来源中的条件与概率必须保留。

## C 原有能力

| 操作 | 结果 |
| --- | --- |
| `render` | 生成单文件 HTML |
| `patch` | 替换已有页面的一个面板 |
| `video` | 生成带动画和旁白的页面 |
| `config` | 查看或修改默认配置 |
| `clean` | 预览或清理历史产物 |

主题、组件和输出路径沿用原 ex-live。

## D 与 ASD-STE100 的关系

ASD-STE100 是英文技术文档标准。ste-zh 将其原则改编为中文写作规则。

本技能把这些中文规则用于 HTML 内容。本项目与 ASD、STE 维护组没有关联。

本项目不包含标准原文或标准词典。中文规则不是 ASD-STE100 官方中文标准。

## E 检查范围

程序检查部分句长、段落和用词。Agent 审阅事实、术语和图文关系。

```callout info 验证边界
程序零警告不代表事实正确。页面生成成功不代表业务结果经过验证。
```

## F 依据

技能行为以本包的 `ex-live/SKILL.md` 为准。

- 中文规则：[ste-zh](https://github.com/dualface/ste-zh/tree/e66ecf52c1900159d709027775a41466edefe224)。
- 标准说明：[ASD-STE100 官方网站](https://www.asd-ste100.org/)。
- 渲染器上游：[answer-me-with-html](https://github.com/QingYunA/answer-me-with-html)。

此页展示技能的写作和排版方式。
