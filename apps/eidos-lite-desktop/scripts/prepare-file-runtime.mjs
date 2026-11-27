import { execFileSync } from "node:child_process"
import { copyFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const app = fileURLToPath(new URL("../", import.meta.url))
const root = path.resolve(app, "../..")
const target = process.argv[2]
const args = ["build", "--release", "--locked", "-p", "eidos-file-runtime-napi"]
if (target) args.push("--target", target)
execFileSync("cargo", args, { cwd: root, stdio: "inherit" })
const library = {
  win32: "eidos_file_runtime_napi.dll",
  darwin: "libeidos_file_runtime_napi.dylib",
  linux: "libeidos_file_runtime_napi.so",
}[process.platform]
const output = path.join(app, "resources", "file-runtime")
await mkdir(output, { recursive: true })
await copyFile(
  path.resolve(
    root,
    process.env.CARGO_TARGET_DIR || "target",
    target || "",
    "release",
    library
  ),
  path.join(output, "eidos-file-runtime.node")
)
