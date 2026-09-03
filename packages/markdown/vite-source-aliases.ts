import { fileURLToPath } from "node:url"

const sourceDirectory = fileURLToPath(new URL("./src/", import.meta.url))

/** Resolve Markdown Editor entry points to workspace source for first-party hosts. */
export function markdownEditorSourceAliases() {
  return [
    {
      find: "@eidos.space/markdown/styles.css",
      replacement: `${sourceDirectory}styles.css`,
    },
    {
      find: "@eidos.space/markdown/plugin-api",
      replacement: `${sourceDirectory}plugin-api.ts`,
    },
    {
      find: "@eidos.space/markdown/plugins",
      replacement: `${sourceDirectory}builtin-plugins.ts`,
    },
    {
      find: /^@eidos\.space\/markdown$/u,
      replacement: `${sourceDirectory}index.ts`,
    },
  ]
}
