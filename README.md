# Eidos

[Eidos](https://eidos.space/?home=1) is an extensible framework for managing your personal data throughout your lifetime in one place.

![eidos](/public/show/table-and-doc.webp)

## Features

- Everything runs inside your browser: Your data is stored locally. PWA support.
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
