---
title: CLI 参考
description: Eidos CLI 的完整命令参考
sidebar:
  order: 6
---

`eidos` CLI 的完整命令参考。

## 全局选项

| 选项               | 描述                                  |
| ------------------ | ------------------------------------- |
| `-s, --space <id>` | 目标空间 ID（如果在空间目录中则可选） |
| `-h, --help`       | 显示帮助                              |
| `-V, --version`    | 显示版本                              |

## 空间选择

CLI 自动检测要使用哪个空间：

1. **自动检测**（推荐）：当在空间目录中时，CLI 自动使用该空间
2. **显式指定**：使用 `-s <space>` 或 `--space <space>` 指定空间

```bash
# 在空间目录内 - 自动检测
cd /path/to/my-space
eidos ls
eidos cat readme

# 在空间目录外 - 显式指定
eidos -s my-space ls
eidos --space my-space cat readme
```

## 节点命令（文件系统风格）

当开启名称唯一性时，节点可以通过路径寻址，如 `/folder/document`。

### `ls [path]`

列出指定路径下的节点。

```bash
eidos ls              # 列出根节点
eidos ls projects     # 列出文件夹中的节点
eidos ls -l           # 长格式显示（含 ID）
```

**选项：**

| 选项         | 描述                               |
| ------------ | ---------------------------------- |
| `-l, --long` | 显示详细信息（ID、类型、创建时间） |

### `cat <path>`

查看文档内容（Markdown 输出）。

```bash
eidos cat readme                  # 查看文档 Markdown
eidos cat notes/ideas             # 查看文档内容
```

**注意：** `cat` 仅支持文档类型。查询表格数据请使用 `sql` 命令。

### `mkdir <path>`

创建文件夹。

```bash
eidos mkdir projects
eidos mkdir projects/2024/q1
```

**注意：** 如果路径下已存在同名节点，将报错。

### `touch <path>`

创建文档。

```bash
eidos touch notes/ideas
eidos touch projects/readme
```

**选项：**

| 选项                   | 描述         |
| ---------------------- | ------------ |
| `-c, --content <text>` | 初始文档内容 |

**通过管道创建：**

```bash
# 从文件创建
cat readme.md | eidos touch projects/readme

# 从 echo 创建
echo "# Hello World" | eidos touch notes/hello

# 从命令输出创建
date | eidos touch daily/now

# 或使用 --content 参数
eidos touch notes/ideas --content "# 我的想法"
```

**注意：** 如果路径下已存在同名节点，将报错。

### `mv <source> <destination>`

移动或重命名节点。

```bash
# 重命名
eidos mv drafts/article drafts/final-article

# 移动到不同文件夹
eidos mv drafts/article published/article

# 移动到根目录
eidos mv archive/2024/report report
```

### `append <path>`

追加内容到现有文档。

```bash
# 从字符串追加
eidos append notes/daily --content "## 晚间笔记"

# 从 stdin 追加（管道）
echo "新行" | eidos append notes/log
cat footer.md | eidos append projects/readme

# 追加命令输出
date | eidos append journal/activity
```

**注意：** 文档必须已存在。如不存在请先使用 `touch` 创建。

### `rm <path>`

删除节点。

```bash
eidos rm old-document              # 软删除（移入回收站）
eidos rm sensitive -f              # 永久删除
eidos rm old-folder -r             # 递归删除文件夹
eidos rm sensitive-folder -rf      # 强制 + 递归
```

**选项：**

| 选项              | 描述                   |
| ----------------- | ---------------------- |
| `-f, --force`     | 永久删除（跳过回收站） |
| `-r, --recursive` | 删除文件夹时必须指定   |

## 查询命令

### `sql <query>`

直接对 SQLite 数据库执行 **只读** SQL 查询。

```bash
eidos sql "SELECT * FROM eidos__tree WHERE type = 'doc'"
eidos sql "SELECT title, status FROM tb_abc123 WHERE status = 'todo'"
```

:::caution
**重要提示**：此命令仅用于 `SELECT` 查询。不要使用 `INSERT`、`UPDATE` 或 `DELETE` 语句，因为它们会绕过 Eidos 的事务处理机制，可能导致数据损坏。请使用适当的 CLI 命令（`touch`、`mkdir`、`mv`、`rm`）或桌面应用进行数据修改。
:::

## 表格命令

### `table ls`

列出当前空间中的所有表格。

```bash
eidos table ls         # 简单列表
eidos table ls -l      # 详细列表（含 ID）
```

### `table schema <table-id>`

显示表格的结构，包括字段名称、列名、类型和公式属性。

```bash
eidos table schema tb_abc123
```

**输出列：**

| 列名         | 描述                                         |
| ------------ | -------------------------------------------- |
| `Name`       | 字段显示名称                                 |
| `ColumnName` | 数据库列名（用于 SQL 查询）                  |
| `Type`       | 字段类型（text、number、select、formula 等） |
| `Property`   | 公式表达式（仅 formula 类型显示）            |

## 扩展命令

### `ext deploy <path>`

从文件部署扩展。

```bash
eidos ext deploy ./my-view.tsx
eidos ext deploy ./script.ts --slug my-script --force
```

**选项：**

| 选项            | 描述                         |
| --------------- | ---------------------------- |
| `-f, --force`   | 如果扩展已存在则覆盖         |
| `--slug <slug>` | 指定扩展的唯一标识符（slug） |

### `ext ls`

列出所有扩展。

```bash
eidos ext ls
```

### `ext rm <id>`

删除扩展。

```bash
eidos ext rm my-extension
```

## 其他命令

### `status`

检查与 Eidos Desktop 的连接。

```bash
eidos status
```

**输出：**

```
✓ Connected to Eidos Desktop (v0.5.0)
  Space: my-space
```

### `completions <shell>`

生成 Shell 自动补全脚本。

```bash
eidos completions bash
eidos completions zsh
eidos completions fish
```

## 示例

### 操作文档

```bash
# 创建并查看文档
eidos touch notes/ideas
eidos cat notes/ideas

# 移动文档到不同文件夹
eidos mkdir archive
eidos mv notes/ideas archive/ideas
```

### 操作表格

```bash
# 使用 SQL 查询表格数据
eidos sql "SELECT * FROM tb_xxx WHERE status = 'todo'"
```

### 批量操作

```bash
# 创建文件夹结构
eidos mkdir projects
eidos mkdir projects/2024
eidos touch projects/2024/roadmap
eidos touch projects/2024/milestones
```
