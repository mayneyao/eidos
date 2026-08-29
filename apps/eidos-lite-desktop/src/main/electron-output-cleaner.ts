import fs from "node:fs/promises"

import type { Plugin } from "vite"

export function cleanElectronOutput(outputDirectory: string): Plugin {
  let cleaned = false
  let watching = false

  return {
    name: "eidos-lite-clean-electron-output",
    configResolved(config) {
      watching = config.build.watch !== null
    },
    async buildStart() {
      if (watching || cleaned) return
      cleaned = true
      await fs.rm(outputDirectory, {
        recursive: true,
        force: true,
      })
    },
  }
}
