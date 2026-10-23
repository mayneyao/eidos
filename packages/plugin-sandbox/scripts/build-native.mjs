import { execFileSync } from "node:child_process"
import { mkdir, copyFile, chmod } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

// Resolve the monorepo root independently of cwd.
const repository = fileURLToPath(new URL("../../../", import.meta.url))
const metadata = JSON.parse(
  execFileSync(
    "cargo",
    ["metadata", "--no-deps", "--format-version", "1", "--locked"],
    { cwd: repository, encoding: "utf8" }
  )
)
execFileSync(
  "cargo",
  ["build", "-p", "eidos-plugin-sandbox-cli", "--release", "--locked"],
  { cwd: repository, stdio: "inherit" }
)
const name =
  process.platform === "win32" ? "plugin-sandbox.exe" : "plugin-sandbox"
const directory = fileURLToPath(
  new URL(`../bin/${process.platform}-${process.arch}/`, import.meta.url)
)
await mkdir(directory, { recursive: true })
const destination = path.join(directory, name)
await copyFile(
  path.join(metadata.target_directory, "release", name),
  destination
)
if (process.platform !== "win32") await chmod(destination, 0o755)
console.log(destination)
