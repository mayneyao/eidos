// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build } from "vite"
import { afterEach, describe, expect, it } from "vitest"

import { prismComponentInteropPlugin } from "../../packages/shared/vite/base.config"

const desktopRoot = path.dirname(fileURLToPath(import.meta.url))
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((temporaryRoot) =>
      rm(temporaryRoot, {
        recursive: true,
        force: true,
      })
    )
  )
})

describe("Prism component interop", () => {
  it("injects an explicit Prism dependency into language components", () => {
    const plugin = prismComponentInteropPlugin()
    const transform = plugin.transform

    expect(transform).toBeTypeOf("function")
    if (typeof transform !== "function") {
      return
    }

    const result = transform.call(
      {} as never,
      "Prism.languages.example = {}",
      "/project/node_modules/prismjs/components/prism-example.js",
      {} as never
    )

    expect(result).toMatchObject({
      code: expect.stringMatching(/^import Prism from "prismjs"/),
    })
  })

  it("initializes Prism before evaluating language components", async () => {
    const temporaryRoot = await mkdtemp(
      path.join(desktopRoot, ".vite-prism-interop-")
    )
    temporaryRoots.push(temporaryRoot)

    const entryPath = path.join(temporaryRoot, "entry.mjs")
    const lazyPath = path.join(temporaryRoot, "lazy.mjs")
    const outputPath = path.join(temporaryRoot, "dist")
    await writeFile(
      entryPath,
      [
        'import "prismjs"',
        'globalThis.__loadPrismLanguage = () => import("./lazy.mjs")',
      ].join("\n")
    )
    await writeFile(
      lazyPath,
      [
        'import Prism from "prismjs"',
        'import "prismjs/components/prism-typescript"',
        "globalThis.__prismHasTypescript = Boolean(Prism.languages.typescript)",
      ].join("\n")
    )

    await build({
      configFile: false,
      logLevel: "silent",
      plugins: [prismComponentInteropPlugin()],
      build: {
        target: "chrome144",
        outDir: outputPath,
        emptyOutDir: true,
        rolldownOptions: {
          input: entryPath,
          output: {
            format: "es",
            entryFileNames: "entry.mjs",
          },
        },
      },
    })

    await import(
      `${pathToFileURL(path.join(outputPath, "entry.mjs")).href}?test=${Date.now()}`
    )
    await (
      globalThis as typeof globalThis & {
        __loadPrismLanguage: () => Promise<unknown>
      }
    ).__loadPrismLanguage()

    expect(
      (globalThis as typeof globalThis & { __prismHasTypescript?: boolean })
        .__prismHasTypescript
    ).toBe(true)
  })
})
