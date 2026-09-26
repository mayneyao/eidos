import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_VERSION = "v0.2.1"
const version = process.env.SQLITE_FS_META_VERSION || DEFAULT_VERSION

function getCliArg(prefix) {
  const arg = process.argv.find((a) => a.startsWith(prefix))
  if (!arg) return null
  return arg.split("=")[1] || null
}

const platform =
  getCliArg("--platform=") ||
  process.env.TARGET_PLATFORM ||
  process.env.npm_config_platform ||
  process.platform

const arch =
  getCliArg("--arch=") ||
  process.env.TARGET_ARCH ||
  process.env.npm_config_arch ||
  process.arch

function resolveAssetInfo(targetPlatform, targetArch) {
  if (targetPlatform === "darwin" && ["arm64", "x64"].includes(targetArch)) {
    const binaryName = "libfs_meta.dylib"
    const assetName =
      targetArch === "arm64"
        ? "libfs_meta-aarch64-apple-darwin.dylib"
        : "libfs_meta-x86_64-apple-darwin.dylib"
    return { binaryName, assetName }
  }
  if (targetPlatform === "win32" && targetArch === "x64") {
    const binaryName = "fs_meta.dll"
    const assetName = "fs_meta-x86_64-pc-windows-msvc.dll"
    return { binaryName, assetName }
  }
  if (targetPlatform === "linux" && ["x64", "arm64"].includes(targetArch)) {
    const binaryName = "libfs_meta.so"
    const assetName =
      targetArch === "arm64"
        ? "libfs_meta-aarch64-unknown-linux-gnu.so"
        : "libfs_meta-x86_64-unknown-linux-gnu.so"
    return { binaryName, assetName }
  }
  throw new Error(`Unsupported platform: ${targetPlatform} (${targetArch})`)
}

const { binaryName, assetName } = resolveAssetInfo(platform, arch)
const destinationDirectory = path.join(appRoot, "resources", "vtab")
const destination = path.join(destinationDirectory, binaryName)
const versionMarker = path.join(destinationDirectory, ".version")

async function main() {
  await fs.mkdir(destinationDirectory, { recursive: true })

  // 1. Explicit path override via environment variable
  if (process.env.SQLITE_FS_META_PATH) {
    const customPath = path.resolve(process.env.SQLITE_FS_META_PATH)
    if (existsSync(customPath)) {
      console.log(`Using custom sqlite-fs-meta binary from: ${customPath}`)
      await fs.copyFile(customPath, destination)
      if (platform !== "win32") await fs.chmod(destination, 0o755)
      await fs.writeFile(versionMarker, `custom:${customPath}`)
      return
    }
    throw new Error(`SQLITE_FS_META_PATH does not exist: ${customPath}`)
  }

  // 2. Check cached binary
  const expectedMarker = `${version}:${assetName}`
  const force =
    process.argv.includes("--force") || process.env.FORCE_DOWNLOAD === "1"
  if (!force && existsSync(destination) && existsSync(versionMarker)) {
    try {
      const currentMarker = readFileSync(versionMarker, "utf8").trim()
      if (currentMarker === expectedMarker) {
        console.log(
          `SQLite fs_meta extension is already up to date: ${destination} (${version})`
        )
        return
      }
    } catch {
      // Continue to download on marker read error
    }
  }

  // 3. Download from GitHub Release
  const downloadUrl = `https://github.com/mayneyao/sqlite-fs-meta/releases/download/${version}/${assetName}`
  console.log(
    `Downloading sqlite-fs-meta (${version}) for ${platform}-${arch} from:`
  )
  console.log(`  ${downloadUrl}`)

  const response = await fetch(downloadUrl, { redirect: "follow" })
  if (!response.ok) {
    throw new Error(
      `Failed to download sqlite-fs-meta from ${downloadUrl}: ${response.status} ${response.statusText}`
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const checksumsResponse = await fetch(
    `https://github.com/mayneyao/sqlite-fs-meta/releases/download/${version}/SHA256SUMS`
  )
  if (!checksumsResponse.ok)
    throw new Error(
      `Could not download sqlite-fs-meta checksums: ${checksumsResponse.status}`
    )
  const expected = (await checksumsResponse.text())
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find(([, name]) => name?.replace(/^\*/, "") === assetName)?.[0]
  if (
    !expected ||
    createHash("sha256").update(buffer).digest("hex") !== expected.toLowerCase()
  ) {
    throw new Error(`Checksum mismatch for sqlite-fs-meta ${assetName}`)
  }
  await fs.writeFile(destination, buffer)
  if (platform !== "win32") {
    await fs.chmod(destination, 0o755)
  }
  await fs.writeFile(versionMarker, expectedMarker)

  console.log(
    `Successfully prepared SQLite fs_meta extension: ${destination} (${buffer.length} bytes)`
  )
}

main().catch((err) => {
  console.error("prepare-vtab failed:", err)
  process.exit(1)
})
