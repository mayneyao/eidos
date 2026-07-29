import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

async function readJson(
  relativePath: string
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await fs.readFile(path.join(appRoot, relativePath), "utf8")
  ) as Record<string, unknown>
}

describe("Eidos Lite package identity", () => {
  it("keeps an independent application identity and release metadata", async () => {
    const packageJson = await readJson("package.json")
    const builder = await readJson("electron-builder.json")

    expect(packageJson.name).toBe("@eidos.space/eidos-lite-desktop")
    expect(packageJson.author).toBe("mayneyao")
    expect(packageJson.homepage).toBe("https://eidos.space")
    expect(builder.appId).toBe("space.eidos.lite")
    expect(builder.productName).toBe("Eidos Lite")
  })

  it("uses the checked-in official Eidos icons on every target", async () => {
    const builder = await readJson("electron-builder.json")
    const mac = builder.mac as Record<string, unknown>
    const win = builder.win as Record<string, unknown>
    const linux = builder.linux as Record<string, unknown>
    const icons = [
      [mac.icon, Buffer.from("icns")],
      [win.icon, Buffer.from([0, 0, 1, 0])],
      [linux.icon, Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ] as const

    for (const [configuredPath, signature] of icons) {
      expect(typeof configuredPath).toBe("string")
      const bytes = await fs.readFile(
        path.resolve(appRoot, configuredPath as string)
      )
      expect(bytes.subarray(0, signature.length)).toEqual(signature)
    }
  })

  it("keeps both macOS packaged smoke architectures in the Lite-only gate", async () => {
    const workflow = await fs.readFile(
      path.resolve(
        appRoot,
        "../../.github/workflows/eidos-lite-desktop-gates.yml"
      ),
      "utf8"
    )

    expect(workflow).toContain("runner: macos-15\n")
    expect(workflow).toContain("runner: macos-15-intel\n")
    expect(workflow).toContain("run: pnpm build:eidos-lite:dev")
    expect(workflow).toContain("run: pnpm smoke:eidos-lite-packaged")
    expect(workflow).not.toContain("softprops/action-gh-release")
  })
})
