<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="static/assets/images/eidos-logo-horizontal-dark.webp">
    <img alt="Eidos" height="150" src="static/assets/images/eidos-logo-horizontal-light.webp">
  </picture>

  <h3>一个面向本地文件与结构化数据的离线优先、AI 驱动个人数据框架。</h3>

  <p>
    在 Eidos Desktop 中，一个 <strong>Space</strong> 就是电脑上的文件夹：
    Markdown 仍是 Markdown，附件仍是普通文件，结构化数据保存在可移植的
    <code>.eidos</code> SQLite 文件中，Graft 为整个 Space 记录版本。
  </p>

  <p>
    <a href="https://eidos.space/download">下载 Desktop</a> ·
    <a href="https://editor.eidos.space">打开 Eidos File</a> ·
    <a href="https://docs.eidos.space">文档</a> ·
    <a href="https://discord.gg/cGQqjeFpZq">Discord</a>
  </p>

  <p><a href="./README.md">English</a> · <a href="./README.zh.md">简体中文</a></p>
</div>

> [!IMPORTANT]
> Eidos `0.34.0-beta.1` 是从 legacy database Space 迁移到 file-based Space
> 的早期测试版本。请保留备份，并在确认迁移结果前继续保留原 Space。此 Beta
> 不建议用于承载生产关键数据。

## 当前可以做什么

- **File-based Space** — 将本地文件夹注册为 Space，直接浏览文件树，并创建、
  重命名、移动、删除、导入和搜索文件，无需把文件搬入专有容器。
- **Markdown 与普通文件** — 直接编辑 `.md` 文件，支持自动保存、链接、标题、
  标签、反向链接、图片资源和外部修改冲突处理。其他文本、图片、媒体和二进制
  内容仍是 Space 中的普通文件。
- **Eidos File** — 用可移植的 `.eidos` 文件保存结构化记录。每个文件都是标准
  SQLite 数据库，支持类型字段、关系、公式、Lookup、保存的查询，以及 Grid、
  Gallery 和 Kanban 视图。
- **版本历史** — 使用 Graft 查看 Changes 与 Staged 文件、创建版本、检查文本和
  结构化 Diff、浏览 History、恢复文件或整个 Space，并可选连接 remote。
- **Space Agent** — 使用可配置的模型 provider 和审批模式运行持久 Agent 会话。
  Agent 可以操作 Space 文件、检查 Eidos File、使用版本工具，并调用受信任的
  Extension command。
- **File-based Extension（开发者预览）** — 从 Space 内的 package 添加命令、
  Panel、文件编辑器和 Eidos File 视图。精确的源码快照必须经过显式信任和能力
  授权才能运行。

核心文件编辑可以离线工作。云端模型、网页搜索、Graft remote、从 GitHub
安装 Extension，以及下载功能需要网络连接。

## File-based Space 模型

Space 文件夹是数据的 source of truth，Eidos 直接在原位置处理这些文件：

| 内容                                         | 存储方式                         |
| -------------------------------------------- | -------------------------------- |
| 笔记与文档                                   | 普通 `.md` 文件                  |
| 图片、PDF、媒体和其他附件                    | 普通文件与文件夹                 |
| 结构化表格与视图                             | 可移植的 `.eidos` SQLite 文件    |
| Eidos 本地状态、索引、Agent 会话和 Extension | 由 Eidos 管理的 `.eidos/` 文件夹 |
| 版本历史                                     | 由 Eidos 管理的 `.graft/` 仓库   |

Eidos File 可以使用普通 SQLite 工具打开，也可以使用独立的
[Eidos File 编辑器](https://editor.eidos.space)。Graft 会把 Markdown、附件和
Eidos File 一起纳入版本，而不是把结构化数据隔离到另一个云端服务中。

## Desktop 与浏览器支持

| 能力                                | Eidos Desktop | Eidos File 编辑器 |    Legacy Web/PWA    |
| ----------------------------------- | :-----------: | :---------------: | :------------------: |
| 基于文件夹的 file Space             |     支持      |      不支持       |        不支持        |
| Markdown 与文件树工作流             |     支持      |      不支持       | Legacy database 文档 |
| 打开和编辑本地 `.eidos` 文件        |     支持      |       支持        |        不支持        |
| Grid、Gallery 与 Kanban             |     支持      |       支持        | Legacy database 视图 |
| Graft 版本历史与 remote             |     支持      |      不支持       |        不支持        |
| Space Agent 与 file-based Extension |     支持      |      不支持       |        不支持        |

Desktop 是 file-based Space 的主要体验。浏览器编辑器一次处理一个本地
`.eidos` 文件：Chromium 系浏览器在获得权限后可以写回原文件，其他浏览器使用
显式副本或下载流程。迁移期间，现有 Web/PWA 应用继续支持 legacy database
Space；它不等同于完整的 file-based Desktop 体验。

## 下载与快速开始

1. 从 [eidos.space/download](https://eidos.space/download) 下载 Eidos Desktop。
2. 新建一个文件夹，或将现有文件夹注册为 Space。
3. 添加现有文件、创建 Markdown 笔记，或创建 Eidos File 管理结构化数据。
4. 需要审阅更改并创建可恢复版本时，打开 **Version**。
5. 需要启动限定于当前 Space 的 AI 会话时，打开 **Agent**。

下载页面列出了 Apple Silicon 与 Intel Mac、Windows x64 和 Linux x64 构建。
Beta 的平台覆盖程度可能不同；在重要数据上使用前，请先阅读对应 release notes。

如果只想体验结构化格式而不安装 Desktop，可以打开
[editor.eidos.space](https://editor.eidos.space)，选择本地 `.eidos` 文件或内置示例。

### 迁移 Legacy Space

Desktop 继续支持 legacy database Space。在旧 Space 中打开
**Settings → Migration**，选择一个空文件夹，然后检查导出的 file-based Space。
迁移会创建一个新 Space，不会修改源 Space。部分只包含 legacy Lexical state 的
文档需要保留 recovery sidecar，无法完整转换为 Markdown；停用源 Space 前请先
检查生成的 migration report。

## 开发

环境要求：

- Node.js `22.23.1`（由 [`.node-version`](./.node-version) 固定）
- Corepack，以及仓库固定的 pnpm `10.12.4`

```bash
git clone https://github.com/mayneyao/eidos.git
cd eidos
corepack enable
pnpm install --frozen-lockfile
pnpm install:sqlite-ext
pnpm dev:desktop
```

常用命令：

| 命令                      | 用途                                |
| ------------------------- | ----------------------------------- |
| `pnpm dev:desktop`        | 运行 Desktop 应用                   |
| `pnpm dev:eidos-file-web` | 运行独立 Eidos File 编辑器          |
| `pnpm dev`                | 运行 legacy Web/PWA 应用            |
| `pnpm build:desktop:dev`  | 构建并打包未签名的本地 Desktop 应用 |
| `pnpm test`               | 运行 Vitest 测试                    |
| `pnpm typecheck`          | 检查 monorepo TypeScript 类型       |
| `pnpm lint`               | 运行 Oxlint                         |

## 使用 Eidos 构建应用

已发布的 MIT package 包括：

- [`@eidos.space/eidos-file`](./packages/eidos-file) — `.eidos` 文件的 headless
  runtime、格式校验、浏览器生命周期、查询与修改 API。
- [`@eidos.space/eidos-file-ui`](./packages/eidos-file-ui) — React host，以及可复用的
  Grid、Gallery 和 Kanban 视图。
- [`@eidos.space/core`](./packages/core) — legacy database runtime 的核心 API。
- [`@eidos.space/react`](./packages/react) — legacy Extension runtime 的 React 集成。

File-based Extension SDK 与 CLI 目前仍是从本 monorepo 构建的开发者预览。请从
[`packages/extension-cli/README.md`](./packages/extension-cli/README.md) 开始，并通过
`pnpm extension:cli` 运行工具；不要假设这些预览 package 与已发布的 Eidos File
package 具有相同的稳定性保证。

## 项目状态

`0.34` Beta 将 file-based Space 作为 Desktop 的主要方向，同时保留 legacy
database Space 用于兼容和迁移。新格式、迁移行为、Extension host、Agent 工具和
多平台打包仍在积极测试中。可选的 Graft remote 面向版本传输与备份流程，不是
实时多人协作编辑。

请通过 [GitHub Issues](https://github.com/mayneyao/eidos/issues) 提交可复现问题，
并注明应用版本、操作系统，以及问题发生在 file-based 还是 legacy Space。

## 社区与许可证

- [文档](https://docs.eidos.space)
- [Discord](https://discord.gg/cGQqjeFpZq)
- [贡献者](https://github.com/mayneyao/eidos/graphs/contributors)

Eidos 整体采用 [AGPL-3.0](./LICENSE)。部分用于集成的 package，包括
`@eidos.space/core`、`@eidos.space/react`、`@eidos.space/eidos-file` 和
`@eidos.space/eidos-file-ui`，使用 MIT License。目录
[`extensions/`](./extensions/) 下的 Extension 同样采用 MIT；每个 package 的
manifest 与 license 文件是最终依据。
