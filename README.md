![eidos](/public/show/table-and-doc.webp)

<div align="center">
    <a href="https://eidos.space?home=1">Home Page</a> |
    <a href="https://discord.gg/bsGMPDR23b">Discord</a>
    <p>
    Eidos is an extensible framework for managing your personal data throughout your lifetime in one place.
    </p>
</div>

## Features

- Everything runs inside your browser. It's a pure PWA with no web server.
- Offline Support: Access your data without an internet connection. Data is stored locally for blazing-fast performance.
- AI Features: Deeply integrated with LLM for AI-powered capabilities. Translate, summarize, and interact with your data within Eidos. AI works even offline.
- Extensible: Customize Eidos to suit your needs.

  - Prompt: Speed up your workflow with the Prompt extension. No coding required.
  - UDF: Use JavaScript to customize Formula functions.
  - Script: Create powerful data processing logic with TypeScript/JavaScript.
  - App: Build your own app using any preferred framework.
  - Block: Extend documents with custom blocks.
  - Field: Extend tables with custom fields.

- Developer Friendly:

  - API & SDK
  - Sqlite Standardization: Every table in Eidos is a SQLite table.

## Requirements

Currently, Eidos only supports the latest version of chromium-based browsers, such as Chrome, Edge, Arc, and Brave. It recommends a version greater than 122.

Safari, Firefox, and other browsers are not tested yet.

### Why?

Eidos is built on sqlite-wasm and requires browser support for OPFS[1] to work.

Storing data in a local folder is a good practice to ensure better data security. With Chrome 122 and its later versions, we can get persistent permissions[2] for local folders, so we do not have to select a folder every time we open the web app.

1. https://sqlite.org/wasm/doc/trunk/persistence.md#opfs
2. https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api

## How to develop

1. Clone the repository `git clone git@github.com:mayneyao/eidos.git`
2. Run `pnpm install` to install dependencies
3. Run `pnpm build` (only needed once)
4. Run `pnpm dev`
5. You can now access the app in your browser at http://localhost:5173

### Generate sdk types

```shell
pnpm gen-types
```

## How to deploy your own

### Serverless

Fork this repository and deploy it to your favorite serverless provider. Cloudflare Pages, Vercel, and Netlify are all good choices.

Use `build:self-host` to build the app; this will skip the activation.

### Docker

1. Run `docker build -t eidos .` to build the docker image
2. Run `docker run -p 8080:80 eidos` to start the container, change the port if needed

or use the pre-built image:

```shell
docker run -d  -p 8080:80 ghcr.io/mayneyao/eidos
```

## Roadmap

- [ ] Publish Service: Publish your data to the web.
- [ ] P2p sync based on CRDT: local-first, not local-only. Sync your data across devices.

## Credits

Eidos based on the following open-source projects:

- [sqlite-wasm](https://github.com/sqlite/sqlite-wasm) - Run SQLite in the browser
- [shadcn-ui](https://github.com/shadcn-ui/ui) - UI components
- [glide-data-grid](https://github.com/glideapps/glide-data-grid) - High performance table
- [lexical](https://github.com/facebook/lexical) - Document editor
- [web-llm](https://github.com/mlc-ai/web-llm) - Run LLM in the browser
- [teable](https://github.com/teableio/teable) & [apitable](https://github.com/apitable/apitable) - Teach me how to build an Airtable-like table.

## License

This project is licensed under the terms of the AGPL license.
