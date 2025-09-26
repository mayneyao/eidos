<div align="center">
  <h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="static/assets/images/eidos-logo-horizontal-dark.webp">
    <img alt="eidos logo" height="150" src="static/assets/images/eidos-logo-horizontal-light.webp">
  </picture>
  </h1>
<h3>
   一个可扩展的个人数据管理框架
</h3>
<p align="center">
  将 SQLite 转化为每个人都可以使用的个人口袋数据库
</p>
<div align="center">
  <a target="_blank" href="https://eidos.space/download"><img src="https://img.shields.io/badge/download-eidos-cyan.svg?style=flat-square&sanitize=true" /></a>
  <a target="_blank" href="https://discord.gg/cGQqjeFpZq"><img src="https://img.shields.io/badge/chat-on%20discord-7289da.svg?style=flat-square&sanitize=true" /></a>
  <a aria-label="Top language of Eidos" href="https://github.com/mayneyao/eidos/search?l=typescript">
    <img alt="Top language of Eidos" src="https://img.shields.io/github/languages/top/mayneyao/eidos?style=flat-square&labelColor=000&color=blue">
  </a>
  <a target="_blank" href="https://github.com/mayneyao/eidos/blob/dev/LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=flat-square&sanitize=true" /></a>
  <a href="https://deepwiki.com/mayneyao/eidos"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</div>

<div align="center">
  <a href="./README.md">English</a> | <a href="./README.zh.md">中文文档</a>
</div>

</div>

![eidos](/static/assets/images/eidos-table-and-doc.webp)

> [!IMPORTANT]
> Eidos 正在积极开发中。虽然您可以试用，但不建议用于生产环境。请关注官方发布的更新。

## 功能特性

- **个人数据管理**：一个全面的框架，用于组织、存储和管理您的个人数据，提供类似 Notion 的文档和数据库
- **离线支持**：一切都在您的本地机器上运行。无需网络连接即可访问您的数据。数据本地存储，性能极速。
- **AI 功能**：深度集成大语言模型，提供 AI 驱动的功能。在 Eidos 内翻译、总结和与您的数据交互。
- **可扩展性**：简单而强大的扩展系统，让 Eidos 成为可塑的软件，手动编写扩展代码或使用 AI 生成扩展代码。构建工具并使用工具，无限扩展。

  <details>
  <summary>
    Block：用于自定义数据显示和交互的 UI 组件。
  </summary>
    <img src="./static/assets/images/eidos-extension-micro-block.webp" alt="edios block extension" />
  </details>
  <details>
  <summary>
    Script：使用 TypeScript/JavaScript/Python 创建强大的数据处理逻辑。
  </summary>
    <img src="./static/assets/images/eidos-extension-script-as-llm-tools.webp" alt="extension script" />
    <img src="./static/assets/images/eidos-llm-call-custom-script-tools.webp" alt="eidos ai call custom script tools" />
  </details>

- **开放格式**：您获得原始数据，SQLite 中的一切都是开放的。

## 如何使用

从以下地址获取应用：https://eidos.space/download

## 如何开发

1. 克隆仓库 `git clone https://github.com/mayneyao/eidos.git`
2. 运行 `pnpm install` 安装依赖
3. 桌面端开发：
   - 运行 `cd apps/desktop && node scripts/download-libsimple.cjs` 下载 libsimple（仅首次需要）
   - 运行 `pnpm dev:desktop` 启动桌面应用
4. Web 端开发：
   - 运行 `pnpm dev` 启动 Web 应用（PWA）

## Eidos 工作原理

更多详细信息，请访问：https://docs.eidos.space/

## 贡献者

<a href="https://github.com/mayneyao/eidos/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=mayneyao/eidos" />
</a>

## 许可证

本项目采用 AGPL 许可证条款。
