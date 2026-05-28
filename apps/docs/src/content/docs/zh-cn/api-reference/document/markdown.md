---
title: Markdown 转化指南
description: Eidos Lexical 编辑器状态与标准/扩展 Markdown 语法之间的映射。
sidebar:
  order: 4
---

在 Eidos 中，文档以 Lexical 编辑器状态（JSON）的形式存储，以实现丰富的交互和性能。同时，系统保持了对 Markdown 的高度兼容。本页记录了 Lexical 节点如何转化为 Markdown，以及反向转换的映射规则。

## 核心转换器 (Core Transformers)

这些标准节点遵循通用的 Markdown 规范，支持双向转换。

| 节点类型        | Markdown 语法                           | 转换方向 | 备注            |
| :-------------- | :-------------------------------------- | :------: | :-------------- |
| **段落**        | `文本`                                  |    ↔     | 标准段落        |
| **标题**        | `# H1` 到 `###### H6`                   |    ↔     | 支持 1-6 级标题 |
| **引用**        | `> 引用内容`                            |    ↔     |                 |
| **代码块**      | ` ```语言\n代码\n``` `                  |    ↔     |                 |
| **列表**        | `- 子项` (无序) <br /> `1. 子项` (有序) |    ↔     |                 |
| **分割线**      | `---`                                   |    ↔     |                 |
| **链接**        | `[文字](URL)`                           |    ↔     |                 |
| **粗体 / 斜体** | `**粗体**`, `*斜体*`                    |    ↔     |                 |
| **删除线**      | `~~删除线~~`                            |    ↔     |                 |
| **行内代码**    | `` `代码` ``                            |    ↔     |                 |

## Eidos 扩展节点 (Extended Eidos Nodes)

Eidos 在 `@eidos.space/lexical` 中实现了多个自定义节点，大多数节点通过特定的 token 或自定义标签（如 HTML-like tags）支持双向转换。

| 节点类型            | Markdown 语法                                      | 转换方向 | 备注                                       |
| :------------------ | :------------------------------------------------- | :------: | :----------------------------------------- |
| **Mermaid**         | ` ```mermaid\n图形代码\n``` `                      |    ↔     | 多行代码块，语言标识为 `mermaid`           |
| **图片**            | `![说明](链接)`                                    |    ↔     | Lexical 状态中支持额外的元数据存储         |
| **Mention**         | `[[ id ]]`                                         |    ↔     | 内部文档/节点引用                          |
| **SQL 查询**        | `<query sql="..." />`                              |    ↔     | 在文档中直接执行 SQL 查询                  |
| **图表 (Chart)**    | `<chart>\n配置内容\n</chart>`                      |    ↔     | 基于 SQL 或原始配置的可视化块              |
| **书签 (Bookmark)** | `<a href="URL" data-eidos-type="bookmark">URL</a>` |    ↔     | 符合标准的 HTML 标签，用于渲染链接预览卡片 |
| **YouTube**         | `https://www.youtube.com/watch?v=ID`               |    ↔     | 自动识别并呈现为交互式播放器               |
| **视频 (Video)**    | `<video src="..." />`                              |    ↔     | 使用 HTML 风格标签保持视频块               |
| **音频 (Audio)**    | `<audio src="..." />`                              |    ↔     | 使用 HTML 风格标签保持音频块               |

## 仅 Lexical 支持的节点 (Lexical-Only Nodes)

某些交互式块目前仅存在于 Lexical 状态中，可能没有专门的 Markdown 表示，或者导出为标准链接/占位符。

| 节点类型       | Markdown 导出       | 转换方向 | 备注                               |
| :------------- | :------------------ | :------: | :--------------------------------- |
| **文件**       | `[文件名](资源Key)` |    →     | 导出为链接，但缺乏专用的导入转换器 |
| **Eidos 表格** | (表格预览)          |    →     | 不同于标准 Markdown 表格           |
| **同步块**     | (占位符)            |    →     | 在多个文档间同步的内容             |

## Headless 转化工具

Eidos 在 `@eidos.space/lexical` 中提供了 Headless（无头）转化工具。这允许在服务器端或 CLI 中将 Markdown 与 Lexical JSON 状态互相转换。

```typescript
import { markdown2lexical, lexical2markdown } from "@eidos.space/lexical"

// 将 Markdown 转换为 Lexical JSON 状态
const lexicalJSON = await markdown2lexical("# Hello World")

// 将 Lexical JSON 状态转换为 Markdown
const markdown = await lexical2markdown(JSON.stringify(lexicalJSON))
```

:::note
Headless 转化确保了 AI 生成的内容或 CLI 导入的文件能够正确地被识别为 Eidos 的自定义块（如 Mermaid, Image 等）。
:::
