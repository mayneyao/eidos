import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout } from "node:timers/promises"
import { gunzipSync } from "node:zlib"

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

export async function verifyMacUpdateInfo(
  directory,
  productName,
  version,
  architecture
) {
  const { parse } = await import("yaml")
  const metadata = parse(
    await readFile(path.join(directory, "latest-mac.yml"), "utf8")
  )
  const stem = `${productName}-${version}-mac-${architecture}`
  const zip = `${stem}.zip`
  const dmg = `${stem}.dmg`
  if (
    metadata?.version !== version ||
    metadata.path !== zip ||
    !Array.isArray(metadata.files) ||
    metadata.files.length !== 2 ||
    metadata.files[0]?.url !== zip ||
    metadata.files[1]?.url !== dmg ||
    metadata.sha512 !== metadata.files[0].sha512
  ) {
    throw new Error(
      `Invalid macOS update metadata for ${stem}; expected ZIP then DMG`
    )
  }

  for (const entry of metadata.files) {
    const file = path.join(directory, entry.url)
    const { size } = await stat(file)
    const hash = createHash("sha512")
    for await (const chunk of createReadStream(file)) hash.update(chunk)
    if (entry.size !== size || entry.sha512 !== hash.digest("base64")) {
      throw new Error(`macOS update metadata does not match ${entry.url}`)
    }

    const blockmap = JSON.parse(gunzipSync(await readFile(`${file}.blockmap`)))
    const block = blockmap?.files?.[0]
    if (
      blockmap?.version !== "2" ||
      !Array.isArray(blockmap.files) ||
      blockmap.files.length !== 1 ||
      block?.offset !== 0 ||
      !Array.isArray(block.sizes) ||
      !Array.isArray(block.checksums) ||
      block.sizes.length !== block.checksums.length ||
      block.sizes.reduce((total, length) => total + length, 0) !== size
    ) {
      throw new Error(`macOS blockmap does not cover ${entry.url}`)
    }
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
  const config = JSON.parse(
    await readFile(path.join(appRoot, "electron-builder.json"), "utf8")
  )
  const { version } = JSON.parse(
    await readFile(path.join(appRoot, "package.json"), "utf8")
  )
  await verifyMacUpdateInfo(
    path.resolve(appRoot, config.directories.output),
    config.productName,
    version,
    architecture
  )
}
