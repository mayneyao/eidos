import { fileURLToPath } from "node:url"

const sourceDirectory = fileURLToPath(new URL("./src/", import.meta.url))

/**
 * Resolve every Eidos File UI entry point to the current workspace source.
 *
 * The three first-party hosts use this instead of enumerating package
 * subpaths or relying on a previously generated dist directory.
 */
export function eidosFileUiSourceAliases() {
  return [
    {
      find: /^@eidos\.space\/eidos-file-ui\/(.+)$/,
      replacement: `${sourceDirectory}$1`,
    },
    {
      find: "@eidos.space/eidos-file-ui",
      replacement: `${sourceDirectory}index.ts`,
    },
  ]
}
