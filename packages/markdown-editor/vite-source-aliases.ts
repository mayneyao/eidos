import { fileURLToPath } from "node:url"

const sourceDirectory = fileURLToPath(new URL("./src/", import.meta.url))

/** Resolve Markdown Editor entry points to workspace source for first-party hosts. */
export function markdownEditorSourceAliases() {
  return [
    {
      find: "@eidos.space/markdown-editor/styles.css",
      replacement: `${sourceDirectory}styles.css`,
    },
    {
      find: "@eidos.space/markdown-editor",
      replacement: `${sourceDirectory}index.ts`,
    },
  ]
}
