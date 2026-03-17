---
title: CLI 参考
description: Eidos CLI 的完整命令参考
sidebar:
  order: 6
---

`eidos` CLI 的完整命令参考。

## 全局选项

| 选项                   | 描述                                  |
| ---------------------- | ------------------------------------- |
| `-s, --space <id>`     | 目标空间 ID（如果在空间目录中则可选） |
| `-e, --endpoint <url>` | Eidos Desktop 端点                    |
| `-h, --help`           | 显示帮助                              |
| `-V, --version`        | 显示版本                              |

## 节点命令（文件系统风格）

当开启名称唯一性时，节点可以通过路径寻址，如 `/folder/document`。

### `ls [path]`

列出指定路径下的节点。

```bash
eidos ls              # 列出根节点
eidos ls /projects    # 列出文件夹中的节点
eidos ls -l           # 长格式显示（含 ID）
```

**选项：**

| 选项         | 描述                               |
| ------------ | ---------------------------------- |
| `-l, --long` | 显示详细信息（ID、类型、创建时间） |

### `cat <path>`

查看节点内容。

```bash
eidos cat /readme                 # 查看文档 Markdown
eidos cat /projects/tasks         # 查看表格 JSON
eidos cat /dashboard/active-view  # 查看数据视图结果
```

### `mkdir <path>`

创建文件夹。

```bash
eidos mkdir /projects
eidos mkdir /projects/2024/q1
```

**注意：** 如果路径下已存在同名节点，将报错。

### `touch <path>`

创建文档。

```bash
eidos touch /notes/ideas
eidos touch /projects/readme
```

**选项：**

| 选项                   | 描述         |
| ---------------------- | ------------ |
| `-c, --content <text>` | 初始文档内容 |

**通过管道创建：**

```bash
# 从文件创建
cat readme.md | eidos touch /projects/readme

# 从 echo 创建
echo "# Hello World" | eidos touch /notes/hello

# 从命令输出创建
date | eidos touch /daily/now

# 或使用 --content 参数
eidos touch /notes/ideas --content "# 我的想法"
```

**注意：** 如果路径下已存在同名节点，将报错。

### `mv <source> <destination>`

移动或重命名节点。

```bash
# 重命名
eidos mv /drafts/article /drafts/final-article

# 移动到不同文件夹
eidos mv /drafts/article /published/article

# 移动到根目录
eidos mv /archive/2024/report /report
```

### `append <path>`

追加内容到现有文档。

```bash
# 从字符串追加
eidos append /notes/daily --content "## 晚间笔记"

# 从 stdin 追加（管道）
echo "新行" | eidos append /notes/log
cat footer.md | eidos append /projects/readme

# 追加命令输出
date | eidos append /journal/activity
```

**注意：** 文档必须已存在。如不存在请先使用 `touch` 创建。

### `rm <path>`

删除节点。

```bash
eidos rm /old-document              # 软删除（移入回收站）
eidos rm /sensitive -f              # 永久删除
eidos rm /old-folder -r             # 递归删除文件夹
eidos rm /sensitive-folder -rf      # 强制 + 递归
```

**选项：**

| 选项              | 描述                   |
| ----------------- | ---------------------- |
| `-f, --force`     | 永久删除（跳过回收站） |
| `-r, --recursive` | 删除文件夹时必须指定   |

### `sql <query>`

执行 SQL 查询。

```bash
eidos sql "SELECT * FROM eidos__tree WHERE type = 'doc'"
eidos sql "SELECT title, status FROM tb_abc123 WHERE status = 'todo'"
```

## 空间命令

### `space list`

列出所有已注册的空间。

```bash
eidos space list
```

### `space use <id>`

设置当前空间。

```bash
eidos space use my-space
```

### `space open [id]`

在 Eidos Desktop 中打开空间。

```bash
eidos space open              # 打开当前空间
eidos space open my-space     # 打开指定空间
```

### `space add <id> <endpoint>`

添加新空间。

```bash
eidos space add my-workspace http://127.0.0.1:13127
```

### `space remove <id>`

从注册表中移除空间。

```bash
eidos space remove old-space
```

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

### `ext list`

列出所有扩展。

```bash
eidos ext list
```

### `ext enable <id>`

启用扩展。

```bash
eidos ext enable my-extension
```

### `ext disable <id>`

禁用扩展。

```bash
eidos ext disable my-extension
```

### `ext delete <id>`

删除扩展。

```bash
eidos ext delete my-extension
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

## 环境变量

| 变量             | 描述                 | 默认值                   |
| ---------------- | -------------------- | ------------------------ |
| `EIDOS_ENDPOINT` | Desktop RPC 端点     | `http://127.0.0.1:13127` |
| `EIDOS_SPACE`    | 默认空间 ID          | -                        |
| `EIDOS_API_KEY`  | API 密钥（用于认证） | -                        |

## 示例

### 操作文档

```bash
# 创建并查看文档
eidos touch /notes/ideas
eidos cat /notes/ideas

# 移动文档到不同文件夹
eidos mkdir /archive
eidos mv /notes/ideas /archive/ideas
```

### 操作表格

```bash
# 使用 SQL 查询表格数据
eidos sql "SELECT * FROM tb_xxx WHERE status = 'todo'"
```

### 批量操作

```bash
# 创建文件夹结构
eidos mkdir /projects
eidos mkdir /projects/2024
eidos touch /projects/2024/roadmap
eidos touch /projects/2024/milestones
```
