import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const stylesDirectory = dirname(fileURLToPath(import.meta.url))

describe("web app Tailwind sources", () => {
  it("scans workspace packages for shared UI utilities", () => {
    const globalsCss = readFileSync(
      resolve(stylesDirectory, "globals.css"),
      "utf8"
    )
    const packageSource = Array.from(
      globalsCss.matchAll(/@source\s+"([^"]*packages)";/g),
      (match) => match[1]
    ).find((source) => !source.includes("node_modules"))

    expect(packageSource).toBeDefined()

    const packagesDirectory = resolve(stylesDirectory, packageSource!)
    expect(existsSync(packagesDirectory)).toBe(true)
    expect(existsSync(resolve(packagesDirectory, "eidos-file-ui/src"))).toBe(
      true
    )
  })
})
