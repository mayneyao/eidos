import { mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build } from "vite"
import { afterEach, describe, expect, it } from "vitest"

import { desktopElectronAlias } from "./vite.config"

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

describe("desktop Electron CommonJS interop", () => {
  it("loads tslib through its ESM entry under Node conditions", async () => {
    const temporaryRoot = await mkdtemp(
      path.join(desktopRoot, ".vite-main-interop-")
    )
    temporaryRoots.push(temporaryRoot)

    const entryPath = path.join(temporaryRoot, "entry.mjs")
    const outputPath = path.join(temporaryRoot, "dist")
    await writeFile(
      entryPath,
      [
        'import tslib from "tslib"',
        "const { __extends } = tslib",
        "export const extendsHelper = __extends",
      ].join("\n")
    )

    await build({
      configFile: false,
      logLevel: "silent",
      resolve: {
        alias: desktopElectronAlias,
        conditions: ["node"],
      },
      build: {
        target: "node24",
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

    await expect(
      import(
        `${pathToFileURL(path.join(outputPath, "entry.mjs")).href}?test=${Date.now()}`
      )
    ).resolves.toBeDefined()
  })
})
