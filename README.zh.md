<div align="center">
  <h1 align="center">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="static/assets/images/eidos-logo-horizontal-dark.webp">
      <img alt="Eidos" height="150" src="static/assets/images/eidos-logo-horizontal-light.webp">
    </picture>
  </h1>
  <h3>本地优先，数据以你拥有的文件存在。</h3>
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

> [!IMPORTANT]
> **Eidos Lite 现在是 Eidos 的主力产品方向，也是新开发和测试默认选择的桌面应用。** 原 Electron 应用作为 [Eidos Desktop Legacy](./apps/desktop) 保留，用于已有用户和维护工作。Lite 的公开分发仍在准备中，贡献者现在即可运行和构建完整应用。

## Eidos Lite

Eidos Lite 从一个简单的产品模型开始：**Space 就是你拥有的普通文件夹**。一个 Space 可以包含多个 `.eidos` 文件，每个 `.eidos` 文件都是标准 SQLite 数据库，离开 Eidos 依然可以使用。

- **本地优先**：打开后立即使用和编辑本地数据；版本历史与云端状态渐进可用，不会决定本地文件是否可用。
- **开放文件**：可以用标准 SQLite 工具查看 `.eidos` 数据库，也可以导入 CSV 或将表格导出到其他工具。
- **内置版本管理**：查看精确到行的变更、填写有意义的版本说明，并从本地历史恢复整个 Space。
- **可选同步**：需要异地副本或多设备使用时再连接云端；离线或退出登录后，本地工作仍然可用。
- **专注的桌面体验**：Lite 不依赖 Legacy 应用的 Web Server、Markdown、AI、浏览器、终端和扩展子系统。
- **面向真实数据规模**：分页查询、虚拟表格、受限的变更预览和性能门禁共同覆盖大型 SQLite 文件。

## 选择合适的 Eidos

| 产品                 | 状态                    | 适用场景                                            | 位置                                                                                               |
| -------------------- | ----------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Eidos Lite**       | **主力产品 · 积极开发** | 本地优先的 Space、`.eidos` 文件、版本管理与可选同步 | [`apps/eidos-lite-desktop`](./apps/eidos-lite-desktop)                                             |
| Eidos File Web       | 积极维护                | 在浏览器中打开单个 `.eidos` 文件                    | [`apps/eidos-file-web`](./apps/eidos-file-web) · [editor.eidos.space](https://editor.eidos.space/) |
| Eidos CLI            | 积极维护                | 在终端中检查和自动化处理 `.eidos` 文件              | [`apps/cli`](./apps/cli)                                                                           |
| Eidos Desktop Legacy | Legacy 维护             | 依赖文档、AI、扩展和原 Web App 架构的已有工作区     | [`apps/desktop`](./apps/desktop)                                                                   |

## 运行 Eidos Lite

环境要求：Node.js `22.23.1`（由 [`.node-version`](./.node-version) 固定）和 Corepack。

```bash
git clone https://github.com/mayneyao/eidos.git
cd eidos
corepack enable
pnpm install --frozen-lockfile
pnpm dev:eidos-lite
```

构建用于本地体验的未签名应用：

```bash
pnpm build:eidos-lite:dev
```

运行 Lite 的专项验证：

```bash
pnpm test:eidos-lite
pnpm test:eidos-lite:performance
pnpm smoke:eidos-lite-packaged
```

关于进程模型、安全边界、Sync 架构、打包门禁和运行检查，请阅读 [Eidos Lite 开发指南](./apps/eidos-lite-desktop/README.md)。

<details>
<summary><strong>需要维护 Eidos Desktop Legacy？</strong></summary>

原 Desktop 应用复用 `apps/web-app`、运行本地 HTTP 服务，并承载早期的文档、AI 与扩展模型。它仍保留在仓库中用于维护，但不再是默认桌面开发路径。

```bash
pnpm install:sqlite-ext
pnpm dev:desktop
```

修改前请先阅读 [Legacy Desktop 架构说明](./apps/desktop/readme.md)。

</details>

## 开放生态

Eidos 仍然是一个可扩展的个人数据框架。仓库包含共享数据引擎、React 绑定、浏览器编辑器、CLI 和 Legacy 扩展生态。可以从[项目文档](https://docs.eidos.space/)开始，或通过 [`AGENTS.md`](./AGENTS.md)了解仓库结构。

## 贡献者

<a href="https://github.com/mayneyao/eidos/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=mayneyao/eidos" alt="Eidos 贡献者" />
</a>

## 许可证

本项目整体采用 AGPL v3 协议。为了方便集成和生态建设，以下 package 采用 MIT 协议：

- `@eidos.space/core`：[MIT](./packages/core/LICENSE)
- `@eidos.space/react`：[MIT](./packages/react/LICENSE)

[`extensions/`](./extensions/) 目录下的所有扩展同样采用 MIT 协议。
