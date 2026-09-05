import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(
  new URL("../../../packages/markdown/", import.meta.url)
)
const destination = fileURLToPath(
  new URL("../dist/downloads/", import.meta.url)
)
const temporary = mkdtempSync(path.join(tmpdir(), "markdown-builder-package-"))
const manifest = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
)
const result = spawnSync("pnpm", ["pack", "--pack-destination", temporary], {
  cwd: root,
  stdio: "inherit",
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
mkdirSync(destination, { recursive: true })
copyFileSync(
  path.join(temporary, `eidos.space-markdown-${manifest.version}.tgz`),
  path.join(destination, "markdown.tgz")
)
console.log("Builder download includes the package artifact from this build.")
