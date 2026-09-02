# Markdown Editor Playground

This browser playground keeps Eidos's focused WYSIWYG Markdown editor at the
center, with one header action for switching to canonical Markdown source and
another for testing read-only behavior.

Run it from the repository root:

```bash
pnpm dev:markdown-editor-playground
```

Validation commands:

```bash
pnpm test:markdown-editor-playground
pnpm build:markdown-editor-playground
pnpm --filter @eidos.space/markdown-editor-playground test:e2e
```

Deploy the production build to `md.eidos.space`:

```bash
pnpm deploy:markdown-editor-playground
```
