# Markdown Editor Playground

This browser playground keeps Eidos's focused WYSIWYG Markdown editor at the
center, with a read-only toggle and a whole-document source view. Visual blocks
can also enter an in-place, selection-driven source mode for precise Markdown
editing without leaving the document flow.

Pasted clipboard images demonstrate the editor's host callback boundary. The
playground writes each image into its origin-private file system (OPFS), stores
an `opfs://markdown-editor-playground/images/...` URL in canonical Markdown,
and resolves that stable URL to a transient `blob:` URL for display. Reloading
the same Markdown reads the image back from OPFS; neither Blob data nor object
URLs are serialized into the document.

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
