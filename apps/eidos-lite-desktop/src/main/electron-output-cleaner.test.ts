import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { Plugin, ResolvedConfig } from "vite"

import { cleanElectronOutput } from "./electron-output-cleaner"

function configure(
  plugin: Plugin,
  watch: ResolvedConfig["build"]["watch"]
): void {
  const hook = plugin.configResolved
  if (typeof hook !== "function") throw new Error("Missing configResolved hook")
  Reflect.apply(hook, {}, [{ build: { watch } } as ResolvedConfig])
}

async function startBuild(plugin: Plugin): Promise<void> {
  const hook = plugin.buildStart
  if (typeof hook !== "function") throw new Error("Missing buildStart hook")
  await Reflect.apply(hook, {}, [{}])
}

describe("Electron output cleanup", () => {
  let outputDirectory: string

  beforeEach(async () => {
    outputDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-electron-output-")
    )
  })

  afterEach(async () => {
    await fs.rm(outputDirectory, { recursive: true, force: true })
  })

  it("preserves preload output while development builds are watching", async () => {
    const preloadPath = path.join(outputDirectory, "preload.js")
    await fs.writeFile(preloadPath, "preload")
    const plugin = cleanElectronOutput(outputDirectory)

    configure(plugin, {})
    await startBuild(plugin)

    await expect(fs.readFile(preloadPath, "utf8")).resolves.toBe("preload")
  })

  it("cleans stale output once for a production build", async () => {
    const stalePath = path.join(outputDirectory, "stale.js")
    await fs.writeFile(stalePath, "stale")
    const plugin = cleanElectronOutput(outputDirectory)

    configure(plugin, null)
    await startBuild(plugin)

    await expect(fs.stat(stalePath)).rejects.toMatchObject({ code: "ENOENT" })

    await fs.mkdir(outputDirectory, { recursive: true })
    const currentPath = path.join(outputDirectory, "main.js")
    await fs.writeFile(currentPath, "current")
    await startBuild(plugin)

    await expect(fs.readFile(currentPath, "utf8")).resolves.toBe("current")
  })
})
