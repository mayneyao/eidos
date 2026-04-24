---
title: CLI
description: Eidos Desktop 的命令行界面
sidebar:
  order: 5
---

`eidos` CLI 提供了一个命令行界面来与 Eidos Desktop 交互。它专为自动化、AI 代理和偏好终端工作流的高级用户设计。

:::tip
CLI 需要 Eidos Desktop 正在运行才能工作。
:::

## 设计理念

CLI 将你的 Eidos 空间视为文件系统：

- **文档**是可以读取（`cat`）、创建（`touch`）和修改（`append`）的文件
- **文件夹**是可以导航（`ls`）和创建（`mkdir`）的目录
- **表格**是可通过 SQL 查询的数据存储
- **外部目录**可以挂载并通过 `/@/<name>/` 路径访问

这种设计让你可以使用熟悉的 Unix 风格命令来管理个人数据。

## 安装

CLI 已包含在 Eidos Desktop 中：

1. 打开 Eidos Desktop
2. 按 `Cmd/Ctrl + K` 打开命令面板
3. 输入 "install eidos" 并选择 "Install 'eidos' command in PATH"

使用 `eidos status` 验证安装。

## 空间选择

CLI 根据当前目录自动检测空间。当位于空间目录内时，命令自动针对该空间。

对于其他位置，使用 `-s <space>` 标志显式指定空间。

## 核心能力

### 类文件系统操作

使用熟悉的命令管理节点：`ls`、`cat`、`mkdir`、`touch`、`mv`、`rm`、`append`。当启用名称唯一性时，节点可以通过路径如 `projects/roadmap` 来寻址。

### 外部目录挂载

挂载本地目录，通过 `/@/<挂载名>/` 路径在 Eidos 内访问。这对于大型文件（媒体库、文档集合）很有用，你不想将它们存储在同步的 `.eidos` 目录中。

### SQL 查询

直接对空间的 SQLite 数据库执行只读 SQL 查询，用于高级数据提取。

### 扩展部署

从本地文件部署 blocks 和 scripts，无需使用 GUI。CLI 检测文件类型（`.tsx` 用于 JSX 组件，`.ts` 用于纯脚本）并自动处理编译。

### AI 优化输出

使用 `--format json` 获取机器可读的输出，便于与 AI 代理和自动化脚本集成。

## 文档

- [CLI 操作指南](../../how-to/use-cli/) - 常见工作流和示例
- [CLI API 参考](../../api-reference/cli/) - 完整命令参考
- [Node API 参考](../../api-reference/node/) - 了解节点结构
