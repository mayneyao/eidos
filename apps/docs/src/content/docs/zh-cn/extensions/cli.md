---
title: CLI
description: Eidos Desktop 的命令行工具
sidebar:
  order: 5
  badge: New
---

`eidos` CLI 提供了强大的、对开发者友好的命令行界面，用于与 Eidos Desktop 进行交互。它专为自动化、AI 代理以及偏好使用终端进行快速数据操作和扩展管理的高级用户设计。

:::tip
使用 CLI 前请确保 Eidos Desktop 处于运行状态。
:::

## 核心特性

- **类文件系统命令**：使用熟悉的 `ls`、`cat`、`mkdir`、`touch`、`mv` 和 `rm` 命令管理文档和文件夹。
- **基于路径的寻址**：在开启“名称唯一性”后，可以通过语义化路径（例如 `projects/roadmap`）访问任何节点。
- **AI 优化**：支持 `--format json` 标志，方便 AI 代理和脚本进行解析。
- **扩展部署**：直接从本地文件系统部署区块（Block）和脚本（Script）扩展。
- **原始 SQL 访问**：直接对空间的 SQLite 数据库执行查询。

## 安装与设置

从 [GitHub Releases](https://github.com/mayneyao/eidos/releases) 下载适用于您平台的预编译二进制文件，并将其添加到系统 PATH 中。

检查连接状态：

```bash
eidos status
```

## 空间管理

在执行数据操作之前，必须选择一个活动空间。

```bash
# 列出可用空间
eidos space list

# 切换到指定空间
eidos space use my-workspace

# 显示当前空间信息
eidos space info

# 在默认浏览器中打开空间
eidos space open
```

## 节点操作（类 FS 风格）

Eidos CLI 将您的空间视为文件系统。文档和表格是树中的节点。

### `ls [path]`

列出路径下的子节点。

```bash
# 列出根节点
eidos ls

# 列出文件夹中的节点并显示详细信息
eidos ls projects --long
```

### `touch <path>`

创建一个文档。

```bash
# 创建空文档
eidos touch notes/meeting-notes

# 创建并指定内容
eidos touch notes/idea --content "# 我的想法\n这真是一个好主意。"

# 从其他命令管道输入内容
cat draft.md | eidos touch papers/final
```

### `cat <path>`

查看文档内容（Markdown 输出）。

```bash
# 查看文档的 Markdown 内容
eidos cat notes/idea
```

**注意：** `cat` 仅支持文档类型。查询表格数据请使用 `sql` 命令。

### `mkdir <path>`

创建文件夹。

```bash
eidos mkdir archive/2024/january
```

### `mv <src> <dst>`

移动或重命名节点。

```bash
# 重命名
eidos mv notes/idea notes/archived-idea

# 移动到不同文件夹
eidos mv notes/archived-idea archive/2024/
```

### `rm <path>`

删除节点。

```bash
# 移入回收站
eidos rm old-doc

# 永久递归删除（请谨慎操作！）
eidos rm -f -r archive/2023
```

## 扩展管理

无需接触 GUI 即可部署和管理扩展。

```bash
# 从源码部署组件并指定 slug
eidos ext deploy ./my-block.tsx --slug my-custom-view

# 强制覆盖更新现有扩展
eidos ext deploy ./my-block.tsx --force

# 列出已安装的扩展
eidos ext list

# 启用/禁用扩展
eidos ext enable <ext-id>
eidos ext disable <ext-id>
```

## 脚本编写与 AI 集成

CLI 旨在与其他工具无缝对接。

### JSON 输出

使用 `--format json` 或 `-f json` 标志获取机器可读的输出：

```bash
eidos ls -f json
```

### SQL 执行

执行原始 SQL 查询以进行复杂的数据提取：

```bash
eidos sql "SELECT title FROM users WHERE status = 'active' LIMIT 5"
```

### 自动补全

为您的 Shell 生成补全脚本：

```bash
eidos completions zsh > ~/.zsh/completion/_eidos
```

## 了解更多

- [CLI API 参考](../../api-reference/cli/) - 完整的命令参考
- [API 参考：Node API](../../api-reference/node/) - 理解节点结构
- [操作指南：部署扩展](../../how-to/deploy-extensions/) - 扩展开发实操指南
