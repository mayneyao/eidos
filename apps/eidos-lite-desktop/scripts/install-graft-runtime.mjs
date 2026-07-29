import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(
  await fs.readFile(path.join(appRoot, "graft-runtime-manifest.json"), "utf8")
)
const platformKey = `${process.platform}-${process.arch}`
const platform = manifest.platforms[platformKey]

if (!platform) {
  throw new Error(`Graft ${manifest.version} is not bundled for ${platformKey}`)
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function findFile(root, name) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name)
    if (entry.isFile() && entry.name === name) return candidate
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, name)
      if (nested) return nested
    }
  }
  return null
}

async function extractArchive(archivePath, destination) {
  if (process.platform === "win32") {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive",
      "-LiteralPath",
      archivePath,
      "-DestinationPath",
      destination,
      "-Force",
    ])
    return
  }
  await execFileAsync("tar", ["-xzf", archivePath, "-C", destination])
}

const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "eidos-lite-graft-")
)

try {
  const response = await fetch(
    `https://github.com/${manifest.repository}/releases/download/${manifest.tag}/${platform.asset}`
  )
  if (!response.ok) {
    throw new Error(`Graft download failed with HTTP ${response.status}`)
  }
  const archive = Buffer.from(await response.arrayBuffer())
  const archiveDigest = sha256(archive)
  if (archiveDigest !== platform.archiveSha256) {
    throw new Error(
      `Graft archive checksum mismatch: expected ${platform.archiveSha256}, received ${archiveDigest}`
    )
  }

  const archivePath = path.join(temporaryRoot, platform.asset)
  const extractPath = path.join(temporaryRoot, "extract")
  await fs.mkdir(extractPath)
  await fs.writeFile(archivePath, archive)
  await extractArchive(archivePath, extractPath)

  const source = await findFile(extractPath, platform.sourceFile)
  if (!source)
    throw new Error(`Graft archive does not contain ${platform.sourceFile}`)
  const binary = await fs.readFile(source)
  const binaryDigest = sha256(binary)
  if (binaryDigest !== platform.binarySha256) {
    throw new Error(
      `Graft binary checksum mismatch: expected ${platform.binarySha256}, received ${binaryDigest}`
    )
  }

  const outputDirectory = path.join(appRoot, "dist-graft")
  const output = path.join(outputDirectory, platform.installedFile)
  const pending = `${output}.next`
  await fs.mkdir(outputDirectory, { recursive: true })
  await fs.writeFile(pending, binary, { mode: 0o755 })
  await fs.chmod(pending, 0o755)
  await fs.rm(output, { force: true })
  await fs.rename(pending, output)
  process.stdout.write(
    `Installed verified Graft ${manifest.version} for ${platformKey}\n`
  )
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
