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
    Eidos Lite 是用于管理本地文件夹中 Eidos File 与普通文件的桌面应用。<br />
    实验性的 Android 与 iOS 应用，让你在手机上编辑本地 Eidos File 和 Markdown。
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
  <img alt="桌面、Android 与 iOS 上的 Eidos：个人书影音资料库表格与 Markdown 编辑器" src="static/assets/images/eidos-cross-platform.webp" width="1280" />
</p>

## 在手机上使用

Android 与 iOS 支持浏览本地文件、编辑 Markdown，以及查看和编辑 Eidos File 表格与记录。
文件和内置编辑器离线可用，无需账号。与 Eidos Lite 配对后，可通过同一局域网同步本地 Space。

两个移动端目前均为实验性应用，需从源码构建。安装步骤与平台限制见
[Android 指南](./apps/eidos-android/README.md)和 [iOS 指南](./apps/eidos-ios/README.md)。

## 快速开始

- **桌面端：** [下载 Eidos Lite](https://eidos.space/zh/download#eidos-lite)，直接使用本地文件夹。本地功能无需账号。
- **移动端：** 构建实验性的 [Android](./apps/eidos-android/README.md) 或 [iOS](./apps/eidos-ios/README.md) 应用，在手机上本地编辑并与桌面端进行局域网同步。
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
eidos file new example.eidos \
  --table Tasks \
  --label-field Title \
  --fields '[{"name":"Title","type":"text"},{"name":"Status","type":"select"}]'
eidos serve example.eidos --open
```

面向智能体和自动化的使用方式见 [Eidos CLI 指南](./apps/cli/README.md)。

## 仓库组成

`apps/` 存放应用与可部署服务，`crates/` 存放私有 Rust 库，`packages/` 存放共享
TypeScript 包。Eidos File 语义始终由 `packages/eidos-file` 实现，Rust 宿主运行同一份
规范 Runtime。

- [`packages/eidos-file`](./packages/eidos-file) 实现 Eidos File 格式与 Runtime。
- [`packages/eidos-file-ui`](./packages/eidos-file-ui) 提供共享的 React 编辑器界面。
- [`packages/markdown`](./packages/markdown) 提供基于 Lexical 的
  Eidos Flavored Markdown 共享所见即所得编辑器。Markdown 始终是规范值；该包负责导入、
  编辑、序列化、保真检查与插件 API，持久化和附件存储则由宿主负责。
- [`apps/eidos-lite-desktop`](./apps/eidos-lite-desktop) 是桌面应用。
- [`apps/eidos-android`](./apps/eidos-android) 与 [`apps/eidos-ios`](./apps/eidos-ios) 是实验性的原生移动端，内嵌共享编辑器。
- [`apps/eidos-file-web`](./apps/eidos-file-web) 是浏览器编辑器。
- [`apps/markdown-editor-playground`](./apps/markdown-editor-playground) 是共享
  Markdown 编辑器独立的开发与兼容性验证环境。
- [`apps/cli`](./apps/cli) 包含面向智能体的 CLI 与本地服务。
- [`crates`](./crates) 存放 Runtime、SQLite 辅助库、发布引擎及移动端桥接库。
  所有 Rust 消费方共用根目录的 `Cargo.toml` 与 `Cargo.lock`，各应用独立发布。
- [`apps/sqlite-web-viewer`](./apps/sqlite-web-viewer) 是独立的只读 SQLite 查看器。

Rust 库共用一个 workspace 和依赖锁文件：

| Crate                                               | 职责                                                     |
| --------------------------------------------------- | -------------------------------------------------------- |
| [`eidos-file-core`](./crates/eidos-file-core)       | SQLite 格式辅助库                                        |
| [`eidos-runtime-host`](./crates/eidos-runtime-host) | 规范 TypeScript Runtime 的 QuickJS 宿主，可选 Serve 服务 |
| [`eidos-publish`](./crates/eidos-publish)           | 共享发布引擎                                             |
| [`eidos-mobile-host`](./crates/eidos-mobile-host)   | 共享移动端会话与 Graft 编排、Android JNI、iOS C FFI      |

所有 crate 均为私有库（`publish = false`）。根 workspace 统一固定 Graft 与 SQLite
依赖。CLI 与各原生应用保持各自的发布生命周期；Eidos File 和 Eidos File UI
继续以共享的 npm 版本一起发布。

Eidos Lite 使用 [Graft](https://github.com/eidos-space/graft) 提供本地版本历史与可选
Sync。Graft 是独立开发、面向开发者的应用状态版本控制系统。

## 开发

需要 Node.js `22.23.1`、Corepack；开发 CLI 还需要 Rust stable。

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm dev:eidos-lite
pnpm dev:eidos-file-web
pnpm dev:markdown-editor-playground
pnpm test:eidos-file
pnpm test:markdown-editor
```

JavaScript 与 Rust 命令均从仓库根目录运行。Rust 构建产物写入根目录的 `target/`：

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked --features eidos-mobile-host/ffi -- -D warnings
cargo test --workspace --locked --features eidos-mobile-host/ffi
cargo build -p eidos --release --locked
```

Runtime 宿主默认不启用任何 feature。CLI 显式开启 `serve`，Android 使用 JNI，iOS
开启移动端宿主的 `ffi` feature。标准移动端构建脚本在隔离的源码镜像中应用已验证的
Graft 补丁并开启 `planned-transfer-progress`，保持根锁文件中的依赖版本不变。

QuickJS bundle 与 Serve UI 由源码生成，并与源码一起提交在对应的 TS 包内：

```bash
# packages/eidos-file/generated/quickjs/
pnpm --filter @eidos.space/eidos-file build:quickjs

# packages/eidos-file-serve/generated/ui/
pnpm --filter @eidos.space/eidos-file-serve build
```

修改相关源码后需重新生成。Rust 构建会校验源码与产物的哈希，拒绝陈旧生成物。
Serve UI 构建直接引用 workspace 中的 Eidos File 源码。

移动端独立于桌面端和浏览器构建。所需的平台 SDK 与 Rust 目标见
[Android](./apps/eidos-android/README.md) 和 [iOS](./apps/eidos-ios/README.md) 指南。

更多内容见[文档站点](./apps/docs)与规范性的
[Eidos File 规范](./docs/specs)。

## 许可证

仓库整体采用 AGPL v3。可复用的
[`@eidos.space/eidos-file`](./packages/eidos-file) 与
[`@eidos.space/eidos-file-ui`](./packages/eidos-file-ui) packages 采用 MIT。
