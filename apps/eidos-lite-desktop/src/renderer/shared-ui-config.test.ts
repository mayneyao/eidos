import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { eidosFileUiSourceAliases } from "../../../../packages/eidos-file-ui/vite-source-aliases"

const workspaceRoot = new URL("../../../../", import.meta.url)
const sharedStyleImport =
  '@import "@eidos.space/eidos-file-ui/host-styles.css";'

function readWorkspaceFile(path: string): string {
  return readFileSync(new URL(path, workspaceRoot), "utf8")
}

describe("first-party Eidos File UI configuration", () => {
  it("uses one host stylesheet in Web, Lite, and CLI Serve", () => {
    for (const path of [
      "apps/eidos-file-web/src/styles.css",
      "apps/eidos-lite-desktop/src/renderer/styles.css",
      "packages/eidos-file-serve/src/styles.css",
    ]) {
      const styles = readWorkspaceFile(path)
      expect(styles.startsWith(sharedStyleImport), path).toBe(true)
      expect(styles, path).not.toContain("styles/themes/default.css")
      expect(styles, path).not.toContain("eidos-file-ui/src/styles.css")
    }
  })

  it("resolves current UI source in every first-party Vite host", () => {
    for (const path of [
      "apps/eidos-file-web/vite.config.ts",
      "apps/eidos-lite-desktop/vite.config.ts",
      "packages/eidos-file-serve/vite.config.ts",
    ]) {
      expect(readWorkspaceFile(path), path).toContain(
        "eidosFileUiSourceAliases()"
      )
    }

    const [subpathAlias, packageAlias] = eidosFileUiSourceAliases()
    expect(subpathAlias?.find).toBeInstanceOf(RegExp)
    expect(packageAlias?.find).toBe("@eidos.space/eidos-file-ui")
    if (!(subpathAlias?.find instanceof RegExp)) {
      throw new Error("Missing Eidos File UI subpath source alias")
    }
    expect(
      "@eidos.space/eidos-file-ui/host-styles.css".replace(
        subpathAlias.find,
        subpathAlias.replacement
      )
    ).toMatch(/\/packages\/eidos-file-ui\/src\/host-styles\.css$/)
  })

  it("runs Tailwind over CLI Serve's own source classes", () => {
    const serveConfig = readWorkspaceFile(
      "packages/eidos-file-serve/vite.config.ts"
    )
    expect(serveConfig).toContain('import tailwindcss from "@tailwindcss/vite"')
    expect(serveConfig).toContain("plugins: [tailwindcss(), react()]")
  })
})
