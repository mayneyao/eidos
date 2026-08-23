import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cliRoot = path.resolve(appRoot, "../cli")
const executableName = process.platform === "win32" ? "eidos.exe" : "eidos"
const build = spawnSync(
  "cargo",
  ["build", "--release", "--locked", "--manifest-path", "Cargo.toml"],
  { cwd: cliRoot, stdio: "inherit" }
)
if (build.error) throw build.error
if (build.status !== 0) {
  throw new Error(`Could not build the Eidos Publish engine (${build.status})`)
}

const cargoTarget = process.env.CARGO_TARGET_DIR
  ? path.resolve(cliRoot, process.env.CARGO_TARGET_DIR)
  : path.join(cliRoot, "target")
const source = path.join(cargoTarget, "release", executableName)
const destinationDirectory = path.join(
  appRoot,
  "resources",
  "publish-engine"
)
const destination = path.join(destinationDirectory, executableName)
await fs.rm(destinationDirectory, { recursive: true, force: true })
await fs.mkdir(destinationDirectory, { recursive: true })
await fs.copyFile(source, destination)
if (process.platform !== "win32") await fs.chmod(destination, 0o755)
console.log(`Prepared Eidos Publish engine: ${destination}`)
