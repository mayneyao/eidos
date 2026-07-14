---
title: 数据视图
description: 当您需要向您的数据提问时
sidebar:
  order: 3
---

很多时候，我们为了组织内容而感到烦恼：是放在文件夹里，还是按分类存放？是用标签管理，还是建立双向引用？这条信息该放进自由格式的文档，还是存入结构化的表格？

这些纠结的根源，往往是因为软件将组织信息的能力“外包”给了使用者。我们被迫在记录的同时就决定它的最终归宿，试图用有限的分类规则去预测未来的检索需求。

**数据视图 (Dataview)** 的出现就是为了解决这个问题。它将重点从“预先分类”转移到“动态检索”。既然 Eidos 将所有数据都存储在强大的 SQLite 数据库中，我们就不必再纠结信息的物理位置，而是利用强大的检索机制，在需要时将分散的信息聚合在一起。

## 为什么传统方法不行

让我给你讲个真实的故事。我有个朋友，是个极其有条理的人，他保存有趣链接的方式让我印象深刻——不是因为有多好，而是因为有多混乱。

他的书签到处都是：

- 有时候看到好文章，直接粘贴到当天的日记里，加个一句话评论
- 有时候正儿八经地整理到"阅读清单"表格里
- 有时候在项目文档里提到有用的资源
- 有时候用自动化工具直接保存到数据库里

每种方法在当时的语境下都说得通。在日记里记录是因为当时正在写日记；整理到表格是因为想要系统化管理；在文档里提及是因为和项目相关；自动化保存是因为懒得手动操作。

问题来了：三个月后他想找某个链接，得在四个不同的地方翻找。这就像把钥匙分别放在四个不同的抽屉里，然后每次找钥匙都要把所有抽屉翻一遍。

## 数据视图的突破

数据视图解决了这个根本问题。它不是要求你改变行为，而是让你的数据变得可以被查询。

这里的关键洞察是：在 Eidos 中，一切都存储在数据库里。你的文档不是文本文件，而是数据库表中的行。你的结构化数据存在于适当的表中。这意味着你可以写 SQL 查询来跨越所有内容。

回到我朋友的书签问题。有了数据视图，他不需要改变任何习惯。他可以创建一个查询：

- 搜索所有文档中的 URL
- 从专用表中提取书签
- 把所有内容合并到一个视图里
- 显示保存时间和上下文

结果看起来是个表格，但实际上是多个数据源的实时视图。当他在系统任何地方添加新书签时，都会自动出现在这个视图中。就像有个隐形的助手在帮他整理，但从不打扰他的工作流程。

## 实际应用：找出所有待办事项

让我们看个具体例子。假设你想找到系统中所有的待办事项。传统方法是什么？打开每个文档，一个个检查。或者强迫自己只在一个专门的"待办事项"表格里记录任务。

但现实是，待办事项会出现在任何地方：会议记录里的行动项目，阅读笔记里想到的想法，项目文档里的检查清单。强迫自己只在一个地方记录任务，就像强迫自己只在卧室里思考——不现实，也没必要。

有了数据视图，你可以这样查询：

```sql
WITH
  valid_docs AS (
    SELECT
      id,
      content,
      created_at
    FROM
      eidos__docs
    WHERE
      json_valid(content) = 1
  )
SELECT
  json_extract(j.value, '$.children[0].text') as title,
  json_extract(j.value, '$.checked') as checked,
  d.created_at as created_at,
FROM
  valid_docs d,
  json_tree(d.content, '$.root.children') AS parent,
  json_tree(parent.value, '$.children') AS j
WHERE
  parent.type = 'object'
  AND json_extract(parent.value, '$.type') = 'list'
  AND json_extract(parent.value, '$.listType') = 'check'
  AND j.type = 'object'
  AND json_extract(j.value, '$.type') = 'listitem'
```

这个查询会找到所有文档中的待办事项。你得到一个叫 `vw_<node_id>` 的视图，包含系统中所有的待办事项，不管它们原本在哪个文档里。

我知道这看起来有些复杂， 因为我们需要从富文本格式中提取待办事项。但是不用担心，Eidos 内置了许多模版可以帮你快速实现这个功能。在 AI 的帮助下，你可以轻松地创建一个视图来查询所有待办事项。事实上我们完全可以提供一个简单的 markdown 相关的扩展函数来实现这类功能，比如

```sql
-- 使用表值函数获取所有文档中的待办事项
SELECT
  doc_id,
  doc_title,
  todo_text,
  is_checked,
  created_at
FROM md_extract_checkboxes(
  (SELECT id, title, markdown, created_at FROM eidos__docs)
)
ORDER BY created_at DESC, doc_title
```

但是为了数据的透明、可移植、无绑定，使用通用的 JSON 函数来实现是最安全的。这样这个 dataview 可以在任意 sqlite 客户端中查看。

## 更进一步：聚合不同类型的数据

现在假设你还有个专门的项目任务表格，用来追踪 bug：

| title        | description  | done | priority | created_at | updated_at |
| ------------ | ------------ | ---- | -------- | ---------- | ---------- |
| 修复登录问题 | 修复登录问题 | 1    | 高       | 2025-01-01 | 2025-01-01 |
| 修复注册问题 | 修复注册问题 | 0    | 中       | 2025-01-01 | 2025-01-01 |

你可以把文档中的待办事项和这个表格合并：

```sql
SELECT title, done as checked, created_at FROM tb_<node_id>
UNION ALL
SELECT * FROM vw_<node_id>
```

现在你有了一个包含所有待办事项的统一视图——既包括散落在各个文档中的临时任务，也包括正式表格中的项目任务。

想查看最近一周的待办事项？基于已有视图再建一个：

```sql
SELECT * FROM vw_<node_id> WHERE created_at >= date('now', '-7 days')
```

## 列类型注释

在创建数据视图时，你可以使用 SQL 注释来指定列类型。这有助于 Eidos 理解如何显示和与你的数据进行交互。

### 示例：文档导航

这里是一个创建文档导航数据视图的实际例子：

```sql

SELECT
  t.name as title,
  '/' || t.id AS pathname, -- [pathname:url]
  d.*
FROM
  eidos__tree t
  JOIN eidos__docs d ON t.id = d.id
```

这个例子演示了如何：

- **创建可点击链接**：`pathname` 字段使用 `'/' || t.id` 生成可点击的 URL，用于导航到特定文档
- **连接多个表**：将树结构（`eidos__tree`）与文档内容（`eidos__docs`）结合
- **简洁路径**：新架构下路径更加简洁，不再需要在URL中包含工作空间名称
- **构建文档导航**：非常适合创建可搜索、可排序的所有文档列表

生成的数据视图将在一个列中显示文档标题，在另一个列中显示可点击的路径名链接，点击后直接跳转到相应文档。

### 注释格式

你可以直接在 SQL 查询中使用以下格式添加列类型注释：

```sql
-- [列名:字段类型]
```

### 字段类型参考

- **text** - 用于单词和句子
- **number** - 用于数量和计算
- **checkbox** - 用于是/否决策
- **date** - 用于日期（YYYY-MM-DD 格式）
- **datetime** - 用于时间戳
- **select** - 用于从预定义列表中选择
- **multi-select** - 用于标签和类别
- **file** - 用于附件和媒体
- **url** - 用于网页链接
- **rating** - 用于星级评分（1-5）

## 可搜索字段

默认情况下，数据视图无法使用 Ctrl+F 进行搜索，因为它们是虚拟视图，没有物理表来构建全文搜索索引。但是，你可以使用 `@search` 注释来指定哪些字段可以被搜索。

### 启用搜索

在 SQL 查询中添加 `-- @search` 注释，将特定字段标记为可搜索：

```sql
-- @search {title, description}

SELECT
  json_extract(j.value, '$.title') as title,
  json_extract(j.value, '$.description') as description,
  json_extract(j.value, '$.url') as url
FROM eidos__docs d,
  json_tree(d.content, '$.root.children') AS j
WHERE json_extract(j.value, '$.type') = 'bookmark'
```

添加此注释后，在数据视图中按 Ctrl+F 将使用 SQL `LIKE` 查询在 `title` 和 `description` 列中进行搜索。

### 工作原理

- 当你添加 `-- @search {field1, field2}` 时，这些字段变为可搜索
- 搜索使用不区分大小写的子字符串匹配（`LIKE '%query%'`）
- 可以添加多个 `@search` 注释，字段将被合并
- 字段名不区分大小写，但必须存在于 SELECT 结果中
- 搜索结果将在视图中高亮显示（网格、画廊、看板）

### 示例：可搜索的书签

```sql
-- [title:text]
-- [url:url]
-- @search {title, description}

SELECT
  json_extract(j.value, '$.title') as title,
  json_extract(j.value, '$.description') as description,
  json_extract(j.value, '$.url') as url,
  d.created_at
FROM eidos__docs d,
  json_tree(d.content, '$.root.children') AS j
WHERE json_extract(j.value, '$.type') = 'bookmark'
ORDER BY d.created_at DESC
```

现在你可以：

1. 在一个地方查看所有书签
2. 按 Ctrl+F 按标题或描述搜索
3. 使用 Enter / Shift+Enter 在匹配项之间导航

### 提示

- 只有文本类字段适合搜索（text、url 等）
- 为了获得最佳性能，将可搜索字段限制在 2-3 列
- 如果没有 `@search` 注释，搜索框将显示提示以配置可搜索字段

## 这为什么重要

数据视图改变了你和信息的关系。你不再需要在记录信息时就决定它的最终归宿。你可以按照最自然的方式记录，然后通过查询来组织和重新组织。

这就像是从“前序组织”转向“后序组织”。在现实中，我们往往只有在需要用到信息时，才知道最有用的组织方式是什么。

数据视图让你能够根据当下的特定问题，以最有意义的方式动态组织数据。它不再强制将内容锁死在某个严格的分类里，而是根据你的需要，将原本分散在文档、表格、甚至不同扩展中的信息重新连接。

这是一种更符合人类直觉的方法：我们通过关联而非分类来思考。数据视图让工具真正服务于你的思维流，而不是让你为了适应工具而中断思考。

这不只是个技术特性，这是思考信息组织的全新方式。
