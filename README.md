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
<div align="center">
  <a target="_blank" href="https://eidos.space/download"><img src="https://img.shields.io/badge/download-eidos-cyan.svg?style=flat-square&sanitize=true" /></a>
  <a target="_blank" href="https://discord.gg/cGQqjeFpZq"><img src="https://img.shields.io/badge/chat-on%20discord-7289da.svg?style=flat-square&sanitize=true" /></a>
  <a aria-label="Top language of Eidos" href="https://github.com/mayneyao/eidos/search?l=typescript">
    <img alt="Top language of Eidos" src="https://img.shields.io/github/languages/top/mayneyao/eidos?style=flat-square&labelColor=000&color=blue">
  </a>
  <a target="_blank" href="https://github.com/mayneyao/eidos/blob/dev/LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=flat-square&sanitize=true" /></a>
  <a href="https://deepwiki.com/mayneyao/eidos"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</div>

</div>

![eidos](/static/assets/images/eidos-table-and-doc.webp)

> [!IMPORTANT]
> Eidos is under active development. While you can try it out, it's not recommended for production use. Stay tuned for updates on the official release.

## Features

- Out-of-the-box Notion-like documents and databases
- Offline Support: Everything runs inside your local machine. Access your data without an internet connection. Data is stored locally for blazing-fast performance.
- AI Features: Deeply integrated with LLM for AI-powered capabilities. Translate, summarize, and interact with your data within Eidos.
- Extensible: Simple and powerful extension system, make Eidos a malleable software, write extension code manually or use AI to generate extension code. Build tools and use tools, unlimited extension.

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
3. For desktop development:
   - Run `cd apps/desktop && node scripts/download-libsimple.cjs` to download libsimple (only for the first time)
   - Run `pnpm dev:desktop` to start the desktop app
4. For web development:
   - Run `pnpm dev` to start the web app (PWA)

## How Eidos works

For more details, visit https://docs.eidos.space/

## Contributors

<a href="https://github.com/mayneyao/eidos/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=mayneyao/eidos" />
</a>

## License

This project is licensed under the terms of the AGPL license.
