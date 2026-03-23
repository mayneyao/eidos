---
title: Markdown Conversion
description: Mapping between Eidos Lexical state and standard/extended Markdown syntax.
sidebar:
  order: 4
---

In Eidos, documents are stored as Lexical editor state (JSON) for rich interactivity and performance, but they are fully compatible with Markdown. This page documents how Lexical nodes are converted to Markdown and vice versa.

## Core Transformers

These standard nodes follow common Markdown specifications and are fully bi-directional.

| Node Type           | Markdown Syntax                                 | Direction | Notes              |
| :------------------ | :---------------------------------------------- | :-------: | :----------------- |
| **Paragraph**       | `Text`                                          |     ↔     | Standard paragraph |
| **Heading**         | `# H1` to `###### H6`                           |     ↔     |                    |
| **Quote**           | `> Blockquote`                                  |     ↔     |                    |
| **Code Block**      | ` ```language\nCode\n``` `                      |     ↔     |                    |
| **Lists**           | `- Item` (Unordered) <br /> `1. Item` (Ordered) |     ↔     |                    |
| **Horizontal Rule** | `---`                                           |     ↔     |                    |
| **Link**            | `[Text](URL)`                                   |     ↔     |                    |
| **Bold / Italic**   | `**Bold**`, `*Italics*`                         |     ↔     |                    |
| **Strikethrough**   | `~~Strike~~`                                    |     ↔     |                    |
| **Inline Code**     | `` `Code` ``                                    |     ↔     |                    |

## Extended Eidos Nodes

Eidos includes several custom nodes implemented in `@eidos.space/lexical`. Most support bi-directional conversion using custom tokens or HTML-like tags.

| Node Type     | Markdown Syntax                                    | Direction | Notes                                                                 |
| :------------ | :------------------------------------------------- | :-------: | :-------------------------------------------------------------------- |
| **Mermaid**   | ` ```mermaid\nGraph\n``` `                         |     ↔     | Multi-line code block with `mermaid` language                         |
| **Image**     | `![Alt](Src)`                                      |     ↔     | Supports additional metadata in Lexical state                         |
| **Mention**   | `[[ id ]]`                                         |     ↔     | Internal document/node reference                                      |
| **SQL Query** | `<query sql="..." />`                              |     ↔     | Executes SQL directly in the document                                 |
| **Chart**     | `<chart>\nconfig\n</chart>`                        |     ↔     | Visualization block based on SQL or raw config                        |
| **Bookmark**  | `<a href="URL" data-eidos-type="bookmark">URL</a>` |     ↔     | Standard-compliant HTML tag for link preview cards                    |
| **YouTube**   | `https://www.youtube.com/watch?v=ID`               |     ↔     | Automatically detects YouTube and youtu.be URLs as interactive blocks |
| **Video**     | `<video src="..." />`                              |     ↔     | HTML-like tag for video blocks                                        |
| **Audio**     | `<audio src="..." />`                              |     ↔     | HTML-like tag for audio blocks                                        |

## Lexical-Only Nodes

Some interactive blocks currently only exist in the Lexical state and may not have a dedicated Markdown representation or are exported as standard links/placeholders.

| Node Type       | Markdown Export       | Direction | Notes                                                       |
| :-------------- | :-------------------- | :-------: | :---------------------------------------------------------- |
| **File**        | `[FileName](FileKey)` |     →     | Exported as a link, but lacks a specific import transformer |
| **Eidos Table** | (Table Preview)       |     →     | Different from standard Markdown tables                     |
| **Sync Block**  | (Placeholder)         |     →     | Synchronized content across documents                       |

## Headless Conversion

Eidos provides a headless conversion utility in `@eidos.space/lexical` that can be used on the server or in the CLI to transform between Markdown and Lexical JSON without a browser environment.

```typescript
import { markdown2lexical, lexical2markdown } from "@eidos.space/lexical"

// Convert Markdown to Lexical JSON State
const lexicalJSON = await markdown2lexical("# Hello World")

// Convert Lexical JSON State to Markdown
const markdown = await lexical2markdown(JSON.stringify(lexicalJSON))
```

:::note
Headless conversion ensures that even AI-generated content or CLI-imported files maintain the correct node structure and custom Eidos blocks.
:::
