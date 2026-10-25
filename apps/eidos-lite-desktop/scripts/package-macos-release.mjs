import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout } from "node:timers/promises"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const transientNetworkFailure =
  /The network connection was lost|NSURLErrorDomain Code=-(?:1001|1005|1009)|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|HTTP(?:Error)?[^\n]*\b50[234]\b/i
const permanentSigningFailure =
  /invalid credentials|incorrect password|code object is not signed|codesign[^\n]*failed|notarization rejected|status["':\s]+Invalid|HTTP(?:Error)?[^\n]*\b40[13]\b/i

// Retry packaging only, never the Rust/renderer build. Signature, credentials,
// architecture and notarization rejection failures remain immediately fatal.
export async function packageWithRetry({
  run,
  delay = setTimeout,
  warn = console.warn,
}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await run()
    if (result.code === 0) return
    if (
      result.signal ||
      attempt === 3 ||
      permanentSigningFailure.test(result.output) ||
      !transientNetworkFailure.test(result.output)
    ) {
      throw new Error(
        `macOS packaging failed (${result.signal ?? result.code}); see builder output above`
      )
    }
    warn(`Transient macOS packaging network failure; retry ${attempt}/2`)
    await delay(attempt * 10_000)
  }
}

function runBuilder(architecture) {
  const require = createRequire(path.join(appRoot, "package.json"))
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        require.resolve("electron-builder/cli.js"),
        "--mac",
        `--${architecture}`,
        "--publish",
        "never",
        "--config",
        "electron-builder.json",
      ],
      { cwd: appRoot, stdio: ["ignore", "pipe", "pipe"] }
    )
    let output = ""
    const relay = (destination) => (chunk) => {
      destination.write(chunk)
      output = (output + chunk.toString()).slice(-128 * 1024)
    }
    child.stdout.on("data", relay(process.stdout))
    child.stderr.on("data", relay(process.stderr))
    child.once("error", reject)
    child.once("close", (code, signal) => resolve({ code, signal, output }))
  })
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const architecture = process.argv[2] ?? process.arch
  if (process.platform !== "darwin" || !["arm64", "x64"].includes(architecture))
    throw new Error("macOS release packaging requires darwin and arm64 or x64")
  await packageWithRetry({ run: () => runBuilder(architecture) })
}
