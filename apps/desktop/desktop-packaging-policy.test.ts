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

  it("uses a multi-resolution icon for Windows", () => {
    const builderConfig = JSON.parse(
      fs.readFileSync(
        path.join(desktopRoot, "electron/electron-builder.json"),
        "utf8"
      )
    ) as { win: { icon: string } }
    const icon = fs.readFileSync(
      path.join(desktopRoot, "../web-app/public/logo.ico")
    )

    expect(builderConfig.win.icon).toBe("dist/logo.ico")
    expect(icon.readUInt16LE(0)).toBe(0)
    expect(icon.readUInt16LE(2)).toBe(1)

    const imageCount = icon.readUInt16LE(4)
    const imageSizes = Array.from({ length: imageCount }, (_, index) => {
      const entryOffset = 6 + index * 16
      const width = icon.readUInt8(entryOffset) || 256
      const height = icon.readUInt8(entryOffset + 1) || 256

      expect(height).toBe(width)
      expect(icon.readUInt16LE(entryOffset + 6)).toBe(32)
      return width
    })

    expect(imageSizes).toEqual([16, 20, 24, 32, 40, 48, 64, 128, 256])
  })
})
