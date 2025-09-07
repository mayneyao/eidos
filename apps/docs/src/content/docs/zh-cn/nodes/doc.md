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
| created_at  | timestamp | 您首次开始此文档的时间                   |
| updated_at  | timestamp | 您最后一次修改它的时间                   |
| meta        | TEXT      | JSON 格式的显示配置（控制显示哪些属性）  |

巧妙之处在于以两种格式存储内容。`content` 字段保存使编辑流畅的富结构化格式。`markdown` 字段为您提供可移植性——您始终可以以几十年后仍然可读的格式导出您的想法。

### id 生成

- 当您新建一份文档时候 id 是通过 uuidv7 生成的随机字符串。
- 当你使用日志模块时，id 则是当前日期，例如 2025-01-01。

也就是说 `eidos__docs` 表中的 id 会存在 2 种情况，你可以通过 `is_day_page` 字段来区分。

- 随机字符串，例如 `0190b47cc6d0758baf066cd8aded669a`
- 日期，例如 `2025-01-01`

## 自定义属性

您可以在文档中添加自定义属性。这些属性不会影响文档的正常使用，但可以用于存储额外的信息。 它类似于 frontmatter, 在常见约定中在 markdown 头部使用 yaml 格式存储一些元数据。

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

### 保留属性

系统默认的字段（如上表所示）是保留属性，你在新建自定义属性时无法使用这些字段。下面是作为保留属性的字段：

已经存在的属性：

- id
- content
- markdown
- is_day_page
- created_at
- updated_at

未来可能用到的保留属性：

- properties
- meta

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

## 表格中的文档

表格中的每一行记录都可以展开为一份文档。文档内容仍然是 `eidos__docs` 表中的内容，但是会带上表格的元数据。
此份文档在 `eidos__docs` 表中的 `id` 和 `eidos__tree` 表中的 `id` 以及所在 `tb_<node_id>` 表中的 `_id` 是相同的。

- `eidos__docs` 表中的 `id` 例如 `0190b47cc6d0758baf066cd8aded669a`
- `eidos__tree` 表中的 `id` 例如 `0190b47cc6d0758baf066cd8aded669a`
- `tb_<node_id>` 表中的 `_id` 例如 `0190b47c-c6d0-758b-af06-6cd8aded669a`

这类表格中的子文档会存在 2 类属性。

- 所在表格的字段属性
- `eidos__docs` 表中公用的全局属性
