// @vitest-environment node

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const desktopRoot = path.dirname(fileURLToPath(import.meta.url))

describe("desktop packaging policy", () => {
  it("bundles minimatch with the Electron main process", () => {
    const viteConfig = fs.readFileSync(
      path.join(desktopRoot, "vite.config.ts"),
      "utf8"
    )
    const builderConfig = JSON.parse(
      fs.readFileSync(
        path.join(desktopRoot, "electron/electron-builder.json"),
        "utf8"
      )
    ) as { files: string[] }

    const externalNodeModules = viteConfig.match(
      /const externalNodeModules = \[([\s\S]*?)\n\]/
    )?.[1]

    expect(externalNodeModules).toBeDefined()
    expect(externalNodeModules).not.toContain('"minimatch"')
    expect(builderConfig.files).not.toContain("**/node_modules/minimatch/**/*")
  })
})
