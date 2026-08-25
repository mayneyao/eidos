import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const packageRoot = path.dirname(require.resolve("node-pty/package.json"))
const prebuildsRoot = path.join(packageRoot, "prebuilds")

let prebuildDirectories = []
try {
  prebuildDirectories = await fs.readdir(prebuildsRoot, {
    withFileTypes: true,
  })
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

await Promise.all(
  prebuildDirectories
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("darwin-"))
    .map(async (entry) => {
      const helper = path.join(prebuildsRoot, entry.name, "spawn-helper")
      try {
        await fs.chmod(helper, 0o755)
      } catch (error) {
        if (error?.code !== "ENOENT") throw error
      }
    })
)
