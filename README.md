<div align="center">
  <h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="static/assets/images/eidos-logo-horizontal-dark.webp">
    <img alt="eidos logo" height="150" src="static/assets/images/eidos-logo-horizontal-light.webp">
  </picture>
  </h1>
<h3>
   An extensible framework for Personal Data Management.
</h3>
<p align="center">
  Transform SQLite into a personal pocket database that everyone can use.
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
> Eidos is under active development. While you can try it out, it's not recommended for production use. Stay tuned for updates on the official release.

## Features

- **Personal Data Management**: A comprehensive framework for organizing, storing, and managing your personal data with Notion-like documents and databases
- **Offline Support**: Everything runs inside your local machine. Access your data without an internet connection. Data is stored locally for blazing-fast performance.
- **AI Features**: Deeply integrated with LLM for AI-powered capabilities. Translate, summarize, and interact with your data within Eidos.
- **Extensible**: Simple and powerful extension system, make Eidos a malleable software, write extension code manually or use AI to generate extension code. Build tools and use tools, unlimited extension.

  <details>
  <summary>
    Block: UI components for customized data display and interaction.
  </summary>
    <img src="./static/assets/images/eidos-extension-micro-block.webp" alt="edios block extension" />
  </details>
  <details>
  <summary>
    Script: Create powerful data processing logic with TypeScript/JavaScript/Python. 
  </summary>
    <img src="./static/assets/images/eidos-extension-script-as-llm-tools.webp" alt="extension script" />
    <img src="./static/assets/images/eidos-llm-call-custom-script-tools.webp" alt="eidos ai call custom script tools" />
  </details>

- Open Format: You get the raw data, everything in sqlite is open.

## How to use

Get the app from: https://eidos.space/download

## How to develop

1. Clone the repository `git clone https://github.com/mayneyao/eidos.git`
2. Run `pnpm install` to install dependencies
3. Install SQLite extensions:
   - Run `pnpm install:sqlite-ext` to install required SQLite extensions (only for the first time)
4. Start development:
   - For desktop development: Run `pnpm dev:desktop` to start the desktop app

## How Eidos works

For more details, visit https://docs.eidos.space/

## Contributors

<a href="https://github.com/mayneyao/eidos/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=mayneyao/eidos" />
</a>

## License

This project is licensed under AGPL. Specific packages are released under MIT to facilitate integration and ecosystem growth:

- `@eidos.space/core`: [MIT](./packages/core/LICENSE)
- `@eidos.space/react`: [MIT](./packages/react/LICENSE)

Additionally, all extensions under the [extensions/](./extensions/) directory are released under the MIT License.
