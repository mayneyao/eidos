import { execFileSync } from "node:child_process"
import { mkdir, copyFile, chmod } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
for (const task of ["build", "build:native"])
  execFileSync(pnpm, ["--filter", "@eidos.space/plugin-sandbox", task], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  })
const name =
  process.platform === "win32" ? "plugin-sandbox.exe" : "plugin-sandbox"
const destination = path.join(
  root,
  "apps/eidos-lite-desktop/resources/plugin-sandbox"
)
await mkdir(destination, { recursive: true })
await copyFile(
  path.join(
    root,
    "packages/plugin-sandbox/bin",
    `${process.platform}-${process.arch}`,
    name
  ),
  path.join(destination, name)
)
await chmod(path.join(destination, name), 0o755)
