# Markdown Editor Demo

This app exercises `@eidos.space/markdown-editor` as a standalone Markdown
workbench. It includes a supported Markdown sample, an unsupported-syntax
fallback sample, a live canonical Markdown view, and light/dark theme controls.

Run it from the repository root:

```bash
pnpm dev:markdown-editor-demo
```

Validation commands:

```bash
pnpm test:markdown-editor-demo
pnpm build:markdown-editor-demo
pnpm --filter @eidos.space/markdown-editor-demo test:e2e
```
