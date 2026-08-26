<div align="center">
  <h1 align="center">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="static/assets/images/eidos-logo-horizontal-dark.webp">
      <img alt="Eidos" height="150" src="static/assets/images/eidos-logo-horizontal-light.webp">
    </picture>
  </h1>
  <h3>单文件多维表格，为你，也为智能体。</h3>
  <p>
    Eidos File 是基于标准 SQLite 的开放单文件格式。<br />
    Eidos Lite 是用于管理本地文件夹中 Eidos File 与普通文件的桌面应用。
  </p>
  <p>
    <a href="https://eidos.space/zh/download#eidos-lite"><img src="https://img.shields.io/badge/下载-Eidos%20Lite-8b5cf6.svg?style=flat-square" alt="下载 Eidos Lite" /></a>
    <a href="https://docs.eidos.space/"><img src="https://img.shields.io/badge/文档-eidos.space-0ea5e9.svg?style=flat-square" alt="Eidos 文档" /></a>
    <a href="https://discord.gg/cGQqjeFpZq"><img src="https://img.shields.io/badge/交流-Discord-7289da.svg?style=flat-square" alt="在 Discord 交流" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/协议-AGPL%20v3-blue.svg?style=flat-square" alt="AGPL v3 协议" /></a>
  </p>
  <p>
    <a href="./README.md">English</a> · <a href="./README.zh.md">中文</a>
  </p>
</div>

<p align="center">
  <img alt="Eidos Lite 中包含类型化字段、关系与多种视图的个人书影音多维表格" src="static/assets/images/eidos-lite-grid.webp" width="1280" />
</p>

## 快速开始

- **桌面端：** [下载 Eidos Lite](https://eidos.space/zh/download#eidos-lite)，直接使用本地文件夹。本地功能无需账号。
- **浏览器：** 打开 [editor.eidos.space](https://editor.eidos.space/)，无需安装即可创建或编辑本地 `.eidos` 文件。
- **命令行：** 安装 `eidos`，创建、检查、查询、修改或在本地打开 Eidos File。

macOS 或 Linux：

```bash
curl -fsSL https://download.eidos.space/cli/install.sh | sh
```

Windows PowerShell：

```powershell
irm https://download.eidos.space/cli/install.ps1 | iex
```

创建文件并在本地打开：

```bash
eidos create example.eidos \
  --table Tasks \
  --label-field Title \
  --fields '[{"name":"Title","type":"text"},{"name":"Status","type":"select"}]'
eidos serve example.eidos --open
```

面向智能体和自动化的使用方式见 [Eidos CLI 指南](./apps/cli/README.md)。

## 仓库组成

- [`packages/eidos-file`](./packages/eidos-file) 实现 Eidos File 格式与 Runtime。
- [`packages/eidos-file-ui`](./packages/eidos-file-ui) 提供共享的 React 编辑器界面。
- [`apps/eidos-lite-desktop`](./apps/eidos-lite-desktop) 是桌面应用。
- [`apps/eidos-file-web`](./apps/eidos-file-web) 是浏览器编辑器。
- [`apps/cli`](./apps/cli) 包含面向智能体的 CLI 与本地服务。
- [`apps/sqlite-web-viewer`](./apps/sqlite-web-viewer) 是独立的只读 SQLite 查看器。

Eidos Lite 使用 [Graft](https://github.com/eidos-space/graft) 提供本地版本历史与可选
Sync。Graft 是独立开发、面向开发者的应用状态版本控制系统。

## 开发

需要 Node.js `22.23.1`、Corepack；开发 CLI 还需要 Rust stable。

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm dev:eidos-lite
pnpm dev:eidos-file-web
pnpm test:eidos-file
```

CLI 在独立的 Rust workspace 中开发：

```bash
cd apps/cli
cargo test --workspace --locked
```

更多内容见[文档站点](./apps/docs)与规范性的
[Eidos File 规范](./docs/specs)。

## 许可证

仓库整体采用 AGPL v3。可复用的
[`@eidos.space/eidos-file`](./packages/eidos-file) 与
[`@eidos.space/eidos-file-ui`](./packages/eidos-file-ui) packages 采用 MIT。
