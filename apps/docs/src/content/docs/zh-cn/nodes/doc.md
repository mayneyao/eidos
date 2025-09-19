---
title: 文档
description: 您思想的栖息地
sidebar:
  order: 1
---

文档是 Eidos 的核心。它们是您思考、写作和捕捉想法的地方。但与典型的文字处理器不同，这些文档被设计为与您的其余数据良好配合。

把它们想象成知道自己是更大系统一部分的智能文本容器。

## 我们如何存储您的文字

Eidos 中的每个文档都存在于一个名为 `eidos__docs` 的表中。如果您习惯于将文档视为文件，这可能看起来很奇怪，但有充分的理由。

当您的文档在数据库中时，它们变得可查询。您可以立即搜索所有写作内容。您可以在文档之间创建链接。您甚至可以编写脚本来分析您的写作模式或从您的笔记中提取信息。

以下是底层存储的样子：

```sql
CREATE TABLE IF NOT EXISTS eidos__docs (
    id TEXT PRIMARY KEY,
    content TEXT,
    markdown TEXT,
    is_day_page BOOLEAN DEFAULT 0,
    meta TEXT DEFAULT '{}', -- JSON string for display configuration
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 每个字段的含义

| 字段        | 类型      | 用途                                     |
| ----------- | --------- | ---------------------------------------- |
| id          | TEXT      | 每个文档的唯一指纹                       |
| content     | TEXT      | Lexical 格式的富内容（编辑器使用的格式） |
| markdown    | TEXT      | 用于导出和互操作性的 markdown 版本       |
| is_day_page | boolean   | 这是否是日常日记页面                     |
| meta        | TEXT      | JSON 格式的显示配置（控制显示哪些属性）  |
| created_at  | timestamp | 您首次开始此文档的时间                   |
| updated_at  | timestamp | 您最后一次修改它的时间                   |

巧妙之处在于以两种格式存储内容。`content` 字段保存使编辑流畅的富结构化格式。`markdown` 字段为您提供可移植性——您始终可以以几十年后仍然可读的格式导出您的想法。

### id 生成

- 当您新建一份文档时候 id 是通过 uuidv7 生成的随机字符串。
- 当你使用日志模块时，id 则是当前日期，例如 2025-01-01。

也就是说 `eidos__docs` 表中的 id 会存在 2 种情况，你可以通过 `is_day_page` 字段来区分。

- 随机字符串，例如 `0190b47cc6d0758baf066cd8aded669a`
- 日期，例如 `2025-01-01`

## 自定义属性

您可以在文档中添加自定义属性。这些属性不会影响文档的正常使用，但可以用于存储额外的信息。 它类似于 frontmatter, 常见约定中, 在 markdown 头部使用 yaml 格式存储一些元数据。

假设你有一份 markdown 文档如下:

```markdown
---
my_custom_property: value1
my_custom_property_2: value2
---

this is a markdown document
```

那么它在 `eidos__docs` 表中的实际存储如下:

| id  | content           | is_day_page | markdown                    | created_at          | updated_at          | my_custom_property | my_custom_property_2 |
| --- | ----------------- | ----------- | --------------------------- | ------------------- | ------------------- | ------------------ | -------------------- |
| 1   | <lexical_content> | 0           | this is a markdown document | 2025-01-01 12:00:00 | 2025-01-01 12:00:00 | value1             | value2               |

### 属性类型

文档的自定义属性类型不会像表格那样丰富，仅提供一些基础类型

- 文本 text
- 数字 number
- 勾选框 boolean
- 日期 date
- 日期时间 datetime
- 多选 array of text

### 保留属性

系统默认的字段（如上表所示）是保留属性，你在新建自定义属性时无法使用这些字段。下面是作为保留属性的字段：

已经存在的属性：

- id
- content
- markdown
- is_day_page
- created_at
- updated_at
- meta

未来可能用到的保留属性：

- properties
- slug
- filename

同时也避免使用 `_` 开头的字段，在一般的约定中，`_` 开头的字段是系统保留字段。

### 和 dataview 搭配使用

如你所见`eidos__docs` 不会存储文档标题，文档标题在 `eidos__tree`表中。但是 `eidos__tree` 表与 `eidos__docs` 表通过`id` 字段建立了链接关系。因此您可以在 dataview 中使用 join 查询来获取文档标题，并且使用自定义的属性来过滤文档。

```sql
SELECT
  t.name as title,
  d.*
FROM
  eidos__tree t
  JOIN eidos__docs d ON t.id = d.id
WHERE
  d.my_custom_property = 'value1'
  AND d.my_custom_property_2 = 'value2';
```

## 自定义动作

除了自定义属性，您还可以为文档添加自定义动作。这些动作让您的文档变得更加智能和自动化。

想象一下，当您写完一篇文章后，系统可以自动为您生成摘要；当您勾选完所有待办事项后，系统可以自动计算完成度；当您记录完一天的饮食后，系统可以自动计算卡路里摄入量。

这些动作通过 [script](/zh-cn/extensions/script) 扩展来实现。您只需要创建一个脚本，暴露 `type` 为 [docAction](/zh-cn/extensions/script#23-文档动作脚本) 的 meta 对象，系统就会自动识别并将其添加到文档动作菜单中。

### 应用案例 - 计算完成度

假设您用一份文档来记录今天的待办事项，通过勾选框来标记完成状态。您希望系统能够自动计算完成度，让您一目了然地看到今天的进度。

首先，我们需要创建一个名为 `completion` 的数字类型属性。然后，编写一个脚本来分析文档中的勾选框状态：

```ts
export const meta = {
  type: "docAction",
  funcName: "calculateCompletion",
  docAction: {
    name: "Calculate Completion",
    description: "Calculates the completion percentage of the document",
  },
}

export async function calculateCompletion(
  input: Record<string, any>,
  ctx: {
    docId: string
  }
) {
  const { docId } = ctx
  const doc = await eidos.currentSpace.doc.getMarkdown(docId)
  // 从 markdown 中提取 checkbox 的完成占比
  const uncheckedCount = doc
    .split("\n")
    .filter((line) => line.startsWith("- [ ]")).length
  const checkedCount = doc
    .split("\n")
    .filter((line) => line.startsWith("- [x]")).length
  const totalCount = uncheckedCount + checkedCount
  const completion = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0

  await eidos.currentSpace.doc.setProperties(docId, {
    completion,
  })
  return {
    completion,
  }
}
```

### 应用案例 - 计算卡路里

现在让我们看一个更复杂的例子。假设您正在写健身日记，记录每天的饮食情况，并希望系统能够自动计算您摄入的卡路里。

首先，创建一个名为 `calories` 的数字类型属性。然后，我们可以借助 AI 的强大能力来自动分析您的饮食记录。

Eidos SDK 提供了丰富的 AI 功能。您可以使用 `eidos.AI.generateText` 来生成文本内容，比如摘要和总结。对于计算卡路里这种需要结构化数据的场景，我们使用 `eidos.AI.generateObject` 来确保 AI 返回包含卡路里信息的对象：

```ts
export const meta = {
  type: "docAction",
  funcName: "calculateCalories",
  docAction: {
    name: "Calculate Calories",
    description: "Calculates the calories of the document",
  },
}

export async function calculateCalories(
  input: Record<string, any>,
  ctx: {
    docId: string
  }
) {
  const { docId } = ctx
  const doc = await eidos.currentSpace.doc.getMarkdown(docId)
  const { calories } = await eidos.AI.generateObject({
    model: "google/gemini-2.5-flash-lite@openrouter",
    prompt: `Calculate the calories of the following document:
    ${doc}`,
    schema: {
      type: "object",
      properties: {
        calories: {
          type: "number",
        },
      },
      required: ["calories"],
    },
  })
  await eidos.currentSpace.doc.setProperties(docId, {
    calories,
  })
  return {
    calories,
  }
}
```
