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
| `-f, --format`     | 输出格式：`table`（默认）或 `json`    |
| `-h, --help`       | 显示帮助                              |
| `-V, --version`    | 显示版本                              |

## 节点命令

### `ls [path]`

列出指定路径下的节点。

```bash
eidos ls [path] [options]
```

**选项：**

| 选项         | 描述                               |
| ------------ | ---------------------------------- |
| `-l, --long` | 显示详细信息（ID、类型、创建时间） |

### `cat <path>`

查看文档内容（Markdown 输出）。

```bash
eidos cat <path>
```

**注意：** 仅支持文档类型。查询表格数据请使用 `sql`。

### `mkdir <path>`

创建文件夹。

```bash
eidos mkdir <path>
```

### `touch <path>`

创建文档。

```bash
eidos touch <path> [options]
```

**选项：**

| 选项                   | 描述         |
| ---------------------- | ------------ |
| `-c, --content <text>` | 初始文档内容 |

**管道：**

```bash
cat file.md | eidos touch notes/doc
echo "text" | eidos touch notes/doc
```

### `mv <source> <destination>`

移动或重命名节点。

```bash
eidos mv <source> <destination>
```

### `append <path>`

追加内容到文档。

```bash
eidos append <path> [options]
```

**选项：**

| 选项                   | 描述         |
| ---------------------- | ------------ |
| `-c, --content <text>` | 要追加的内容 |

**管道：**

```bash
echo "text" | eidos append notes/doc
```

### `rm <path>`

删除节点。

```bash
eidos rm <path> [options]
```

**选项：**

| 选项              | 描述                   |
| ----------------- | ---------------------- |
| `-f, --force`     | 永久删除（跳过回收站） |
| `-r, --recursive` | 删除文件夹时必须指定   |

## 查询命令

### `sql <query>`

执行只读 SQL 查询。

```bash
eidos sql "SELECT * FROM eidos__tree WHERE type = 'doc'"
```

:::caution
**仅只读。** 不要使用 `INSERT`、`UPDATE` 或 `DELETE`，它们会绕过事务处理。
:::

## 表格命令

### `table ls`

列出所有表格。

```bash
eidos table ls [options]
```

**选项：**

| 选项         | 描述        |
| ------------ | ----------- |
| `-l, --long` | 显示表格 ID |

### `table schema <table-id>`

显示表格结构。

```bash
eidos table schema <table-id>
```

**输出列：**

| 列名         | 描述                        |
| ------------ | --------------------------- |
| `Name`       | 字段显示名称                |
| `ColumnName` | 数据库列名（用于 SQL 查询） |
| `Type`       | 字段类型                    |
| `Property`   | 公式表达式（仅公式类型）    |

### `table import <table-id>` (别名: `add`, `append`)

从 JSON 导入或追加数据记录到表格。

```bash
eidos table import <table-id> [options]
# 导入快捷语法
eidos table <table-id> < data.json
```

**选项：**

| 选项                | 描述               |
| ------------------- | ------------------ |
| `-d, --data <str>`  | 直接输入 JSON 数组 |
| `-i, --file <path>` | 输入 JSON 文件     |

**管道操作：**

```bash
cat data.json | eidos table tb_xxxx
opencli bilibili fav -f json | eidos table tb_xxxx
```

### `table create <name>`

通过自动结构推断或显式定义创建新表格。

```bash
eidos table create <name> [options]
```

**选项：**

| 选项                  | 描述                                     |
| --------------------- | ---------------------------------------- |
| `-F, --fields <list>` | 显式定义字段 (如 `name:text,age:number`) |
| `-T, --template <id>` | 从现有表拷贝结构                         |
| `-d, --data <str>`    | 用于推断结构的 JSON 样例                 |
| `-i, --file <path>`   | 用于推断结构的 JSON 样例文件             |

**结构推断 + 自动导入：**

如果在创建时通过管道或 `--file` 提供了数据，CLI 会自动根据第一条记录推断结构，并在表格创建后自动导入所有数据。

```bash
# 创建 "收藏夹" 并自动推断结构和导入数据
opencli bilibili fav -f json | eidos table create "收藏夹"
```

## 挂载命令

### `mount`

列出所有挂载（默认行为）。

```bash
eidos mount
eidos mount -l
```

### `mount <name> <path>`

挂载目录。

```bash
eidos mount <name> <path>
```

**路径处理：**

- `~` 展开为主目录
- 相对路径解析为绝对路径
- 目录必须存在

**访问模式：** `/@/<name>/filename`

### `mount -u <name>`

卸载目录。

```bash
eidos mount -u <name>
```

## 扩展命令

### `ext deploy <path>`

部署扩展。

```bash
eidos ext deploy <path> [options]
```

**选项：**

| 选项            | 描述                       |
| --------------- | -------------------------- |
| `--slug <slug>` | 更新具有此 slug 的现有扩展 |

**文件扩展名：**

- `.tsx` — 带 JSX 组件的 Block
- `.ts` — 纯 TypeScript 脚本

### `ext ls`

列出扩展。

```bash
eidos ext ls
```

### `ext rm <id>`

删除扩展。

```bash
eidos ext rm <id>
```

## 空间命令

### `space ls`

列出所有空间。

```bash
eidos space ls
```

### `space open [id]`

在 Eidos Desktop 中打开空间。

```bash
eidos space open
eidos space open <id>
```

## 其他命令

### `status`

检查与 Eidos Desktop 的连接。

```bash
eidos status
```

### `completions <shell>`

生成 shell 自动补全脚本。

```bash
eidos completions bash
eidos completions zsh
eidos completions fish
```
