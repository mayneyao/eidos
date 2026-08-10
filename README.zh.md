<div align="center">
  <h1 align="center">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="static/assets/images/eidos-logo-horizontal-dark.webp">
      <img alt="Eidos" height="150" src="static/assets/images/eidos-logo-horizontal-light.webp">
    </picture>
  </h1>
  <h3>开放格式。本地优先。基于文件的多维表格。</h3>
  <p>
    Eidos Lite 将普通文件夹变成快速、可追溯的个人数据空间，<br />
    核心数据保存在开放的 SQLite <code>.eidos</code> 文件中。
  </p>
  <p>
    <a href="./apps/eidos-lite-desktop"><img src="https://img.shields.io/badge/Eidos%20Lite-主力桌面产品-8b5cf6.svg?style=flat-square" alt="Eidos Lite 是主力桌面应用" /></a>
    <a href="https://docs.eidos.space/"><img src="https://img.shields.io/badge/文档-eidos.space-0ea5e9.svg?style=flat-square" alt="Eidos 文档" /></a>
    <a href="https://discord.gg/cGQqjeFpZq"><img src="https://img.shields.io/badge/交流-Discord-7289da.svg?style=flat-square" alt="在 Discord 交流" /></a>
    <a href="https://github.com/mayneyao/eidos/blob/dev/LICENSE"><img src="https://img.shields.io/badge/协议-AGPL%20v3-blue.svg?style=flat-square" alt="AGPL v3 协议" /></a>
  </p>
  <p>
    <a href="./README.md">English</a> · <a href="./README.zh.md">中文</a>
  </p>
</div>

## 快速开始

### 直接使用浏览器

打开 [editor.eidos.space](https://editor.eidos.space/)，无需安装即可创建或编辑本地
`.eidos` 文件。

### 安装 CLI

macOS 或 Linux：

```bash
curl -fsSL https://download.eidos.space/cli/install.sh | sh
```

Windows PowerShell：

```powershell
irm https://download.eidos.space/cli/install.ps1 | iex
```

创建文件，然后在本地打开同一套编辑器 UI：

```bash
eidos create example.eidos
eidos serve example.eidos --open
```

查询、自动化与安全写入流程详见 [Eidos CLI 指南](./apps/cli/README.md)。

## 当前产品线

本仓库包含仍在开发的 Eidos File 与 Eidos Lite 产品线，以及独立的只读 SQLite Web
Viewer。已停止迭代的旧应用保存在 `legacy/0.32` 分支，不再参与当前构建、测试和发布。

| 产品                    | 用途                                           | 位置                                                                                                  |
| ----------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Eidos Lite**          | 桌面 Space、本地文件、版本历史与可选同步       | [`apps/eidos-lite-desktop`](./apps/eidos-lite-desktop)                                                |
| **Eidos File Web**      | 在浏览器中打开和编辑单个 `.eidos` 文件         | [`apps/eidos-file-web`](./apps/eidos-file-web) · [editor.eidos.space](https://editor.eidos.space/)    |
| **Eidos CLI**           | 创建、检查、自动化处理和本地服务 `.eidos` 文件 | [`apps/cli`](./apps/cli)                                                                              |
| **Eidos File packages** | 可移植 Runtime 与共享 React UI                 | [`packages/eidos-file`](./packages/eidos-file) · [`packages/eidos-file-ui`](./packages/eidos-file-ui) |
| **SQLite Web Viewer**   | 只读检查 SQLite 兼容文件                       | [`apps/sqlite-web-viewer`](./apps/sqlite-web-viewer)                                                  |

## Eidos Lite

Space 是用户拥有的普通文件夹，可以同时包含多个 `.eidos` 文件以及普通文本或媒体文件。
Eidos Lite 在不引入专有容器的前提下提供聚焦的编辑体验、版本历史与可选同步。

- `.eidos` 文件始终是标准 SQLite 数据库。
- Eidos File Web、Lite 和 `eidos serve` 共享同一 UI package 与主题契约。
- Graft 提供本地历史和可选远端协议。
- 离线或退出账号后，本地文件仍可正常使用。

## 开发

需要 Node.js `22.23.1`（由 [`.node-version`](./.node-version) 固定）、Corepack；
开发 CLI 还需要 Rust stable。

```bash
corepack enable
pnpm install --frozen-lockfile

# 主力桌面应用
pnpm dev:eidos-lite
pnpm build:eidos-lite:dev
pnpm test:eidos-lite

# 浏览器编辑器
pnpm dev:eidos-file-web
pnpm build:eidos-file-web

# 只读 SQLite Viewer
pnpm dev:sqlite-web-viewer
pnpm test:sqlite-web-viewer

# CLI
cd apps/cli
cargo test --workspace --locked
cargo run -- create example.eidos
cargo run -- serve example.eidos --open
```

Eidos File 的规范文本位于 [`docs/specs`](./docs/specs)。Eidos Lite 的进程模型、打包门禁和
Sync 架构见其[开发指南](./apps/eidos-lite-desktop/README.md)。

## 许可证

仓库整体采用 AGPL v3。可复用的
[`@eidos.space/eidos-file`](./packages/eidos-file) 与
[`@eidos.space/eidos-file-ui`](./packages/eidos-file-ui) packages 采用 MIT。
