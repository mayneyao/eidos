const { execFileSync } = require("node:child_process")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const process = require("node:process")

const manifest = require("../graft-runtime-manifest.json")
const { downloadFile } = require("./download-utils.cjs")

const INSTALL_LOCK_TIMEOUT_MS = 120_000
const INSTALL_LOCK_STALE_MS = 10 * 60_000
const installFlights = new Map()

function normalizeTag(version) {
  return version.startsWith("v") ? version : `v${version}`
}

function validateSha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`)
  }
}

function validateManifest(value = manifest) {
  if (value.schemaVersion !== 1) {
    throw new Error("Unsupported Graft runtime manifest schema")
  }
  if (value.tag !== `v${value.version}`) {
    throw new Error("Graft runtime manifest tag and version do not match")
  }
  if (!/^[a-f0-9]{40}$/.test(value.releaseCommit)) {
    throw new Error("Graft runtime manifest release commit is invalid")
  }
  validateSha256(value.checksumsAsset?.sha256, "Graft SHA256SUMS checksum")
  const platforms = Object.entries(value.platforms || {})
  if (platforms.length !== 6) {
    throw new Error("Graft runtime manifest must cover six Desktop platforms")
  }
  for (const [platformKey, platform] of platforms) {
    if (!platform?.target || !platform.archiveExtension) {
      throw new Error(
        `Graft platform metadata is incomplete for ${platformKey}`
      )
    }
    for (const kind of ["cli", "extension"]) {
      const asset = platform[kind]
      if (!asset?.asset || !asset.sourceFile || !asset.installedFile) {
        throw new Error(
          `Graft ${kind} metadata is incomplete for ${platformKey}`
        )
      }
      validateSha256(
        asset.archiveSha256,
        `Graft ${kind} archive checksum for ${platformKey}`
      )
      validateSha256(
        asset.binarySha256,
        `Graft ${kind} binary checksum for ${platformKey}`
      )
    }
  }
  return value
}

function validateRequestedRelease(env = process.env, value = manifest) {
  const requestedRepository =
    env.GRAFT_RELEASE_REPO || env.GRAFT_SQLITE_EXTENSION_REPO
  if (requestedRepository && requestedRepository !== value.repository) {
    throw new Error(
      `Refusing untrusted Graft repository ${requestedRepository}; expected ${value.repository}`
    )
  }
  const requestedVersion =
    env.GRAFT_RELEASE_VERSION || env.GRAFT_SQLITE_EXTENSION_VERSION
  if (requestedVersion && normalizeTag(requestedVersion) !== value.tag) {
    throw new Error(
      `Refusing unpinned Graft version ${requestedVersion}; expected ${value.tag}`
    )
  }
}

function platformConfig(
  platform = process.platform,
  arch = process.arch,
  value = manifest
) {
  const key = `${platform}-${arch}`
  const config = value.platforms[key]
  if (!config) {
    throw new Error(`Unsupported Graft Desktop platform ${platform} ${arch}`)
  }
  return { key, config }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256")
  const input = fs.openSync(filePath, "r")
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let bytesRead
    do {
      bytesRead = fs.readSync(input, buffer, 0, buffer.length, null)
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead))
    } while (bytesRead > 0)
  } finally {
    fs.closeSync(input)
  }
  return hash.digest("hex")
}

function verifyFileSha256(filePath, expected, label = path.basename(filePath)) {
  const actual = sha256File(filePath)
  if (actual !== expected) {
    throw new Error(
      `${label} checksum mismatch: expected ${expected}, received ${actual}`
    )
  }
  return actual
}

function runtimeDestinations(desktopRoot, config) {
  return {
    cli: path.join(desktopRoot, "dist-cli", config.cli.installedFile),
    extension: path.join(
      desktopRoot,
      "dist-sqlite-ext",
      config.extension.installedFile
    ),
  }
}

function isRuntimeCacheValid(desktopRoot, config) {
  const destinations = runtimeDestinations(desktopRoot, config)
  try {
    return (
      sha256File(destinations.cli) === config.cli.binarySha256 &&
      sha256File(destinations.extension) === config.extension.binarySha256
    )
  } catch (error) {
    if (error?.code === "ENOENT") return false
    throw error
  }
}

function extractArchive(archivePath, extractDir, archiveExtension) {
  if (archiveExtension === "zip") {
    if (process.platform === "win32") {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath ${psQuote(
            archivePath
          )} -DestinationPath ${psQuote(extractDir)} -Force`,
        ],
        { stdio: "inherit" }
      )
    } else {
      execFileSync("unzip", ["-q", "-o", archivePath, "-d", extractDir], {
        stdio: "inherit",
      })
    }
    return
  }
  if (archiveExtension === "tar.gz") {
    execFileSync("tar", ["-xzf", archivePath, "-C", extractDir], {
      stdio: "inherit",
    })
    return
  }
  throw new Error(`Unsupported Graft archive extension: ${archiveExtension}`)
}

function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`
}

function findFileByName(dir, expectedFileName) {
  const matches = []
  const expected = expectedFileName.toLowerCase()
  walk(dir, (filePath) => {
    if (path.basename(filePath).toLowerCase() === expected) {
      matches.push(filePath)
    }
  })
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${expectedFileName} after extraction, found ${matches.length}`
    )
  }
  return matches[0]
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(entryPath, visit)
    else if (entry.isFile()) visit(entryPath)
  }
}

async function stageAsset({
  asset,
  archiveExtension,
  baseUrl,
  download,
  extract,
  tempDir,
}) {
  const archivePath = path.join(tempDir, asset.asset)
  const extractDir = path.join(tempDir, `${asset.installedFile}-extract`)
  fs.mkdirSync(extractDir, { recursive: true })
  await download(`${baseUrl}/${asset.asset}`, archivePath)
  verifyFileSha256(archivePath, asset.archiveSha256, asset.asset)
  extract(archivePath, extractDir, archiveExtension)
  const sourcePath = findFileByName(extractDir, asset.sourceFile)
  verifyFileSha256(sourcePath, asset.binarySha256, asset.sourceFile)
  return sourcePath
}

function replaceRuntimeFiles(files) {
  const token = `${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString("hex")}`
  const prepared = []

  try {
    for (const { sourcePath, destinationPath, mode } of files) {
      const destinationDir = path.dirname(destinationPath)
      const destinationName = path.basename(destinationPath)
      fs.mkdirSync(destinationDir, { recursive: true })
      const candidatePath = path.join(
        destinationDir,
        `.${destinationName}.${token}.new`
      )
      const backupPath = path.join(
        destinationDir,
        `.${destinationName}.${token}.backup`
      )
      fs.copyFileSync(sourcePath, candidatePath)
      prepared.push({
        backupPath,
        candidatePath,
        destinationPath,
        hadDestination: fs.existsSync(destinationPath),
        installed: false,
      })
      fs.chmodSync(candidatePath, mode)
    }

    for (const entry of prepared) {
      if (entry.hadDestination) {
        fs.renameSync(entry.destinationPath, entry.backupPath)
      }
      fs.renameSync(entry.candidatePath, entry.destinationPath)
      entry.installed = true
    }
  } catch (error) {
    for (const entry of [...prepared].reverse()) {
      if (entry.installed) fs.rmSync(entry.destinationPath, { force: true })
      if (fs.existsSync(entry.backupPath)) {
        fs.renameSync(entry.backupPath, entry.destinationPath)
      }
    }
    throw error
  } finally {
    for (const entry of prepared) {
      fs.rmSync(entry.candidatePath, { force: true })
      fs.rmSync(entry.backupPath, { force: true })
    }
  }
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== "ESRCH"
  }
}

function staleInstallLock(lockPath) {
  try {
    const stat = fs.statSync(lockPath)
    try {
      const owner = JSON.parse(fs.readFileSync(lockPath, "utf8"))
      return !processIsAlive(owner.pid)
    } catch {
      return Date.now() - stat.mtimeMs >= INSTALL_LOCK_STALE_MS
    }
  } catch (error) {
    return error?.code !== "ENOENT"
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function acquireInstallLock(lockPath, cacheReady) {
  const token = crypto.randomBytes(16).toString("hex")
  const deadline = Date.now() + INSTALL_LOCK_TIMEOUT_MS
  for (;;) {
    try {
      const descriptor = fs.openSync(lockPath, "wx")
      try {
        fs.writeFileSync(
          descriptor,
          JSON.stringify({ pid: process.pid, token, createdAtMs: Date.now() })
        )
      } finally {
        fs.closeSync(descriptor)
      }
      return { cacheHit: false, token }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error
      if (cacheReady()) return { cacheHit: true, token: null }
      if (staleInstallLock(lockPath)) {
        fs.rmSync(lockPath, { force: true })
        continue
      }
      if (Date.now() >= deadline) {
        throw new Error("Timed out waiting for another Graft runtime install")
      }
      await wait(100)
    }
  }
}

function releaseInstallLock(lockPath, token) {
  if (!token) return
  try {
    const owner = JSON.parse(fs.readFileSync(lockPath, "utf8"))
    if (owner.token === token) fs.rmSync(lockPath, { force: true })
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
}

async function installGraftRuntimeInternal(options) {
  const value = validateManifest(options.manifest || manifest)
  const env = options.env || process.env
  validateRequestedRelease(env, value)
  const desktopRoot = options.desktopRoot || path.resolve(__dirname, "..")
  const selected = platformConfig(
    options.platform || process.platform,
    options.arch || process.arch,
    value
  )
  const config = selected.config
  const cacheReady = () => isRuntimeCacheValid(desktopRoot, config)
  if (cacheReady()) {
    console.log(`postinstall-graft: Using verified ${value.tag} runtime cache`)
    return { cacheHit: true, platform: selected.key, version: value.version }
  }

  const lockPath = path.join(desktopRoot, ".graft-runtime-install.lock")
  const lock = await acquireInstallLock(lockPath, cacheReady)
  if (lock.cacheHit) {
    console.log(`postinstall-graft: Using verified ${value.tag} runtime cache`)
    return { cacheHit: true, platform: selected.key, version: value.version }
  }

  try {
    if (cacheReady()) {
      return { cacheHit: true, platform: selected.key, version: value.version }
    }
    const baseUrl =
      options.baseUrl ||
      env.GRAFT_RELEASE_BASE_URL ||
      `https://github.com/${value.repository}/releases/download/${value.tag}`
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `eidos-graft-${value.version}-`)
    )
    try {
      const stage = {
        archiveExtension: config.archiveExtension,
        baseUrl,
        download: options.download || downloadFile,
        extract: options.extract || extractArchive,
        tempDir,
      }
      const cliSource = await stageAsset({ ...stage, asset: config.cli })
      const extensionSource = await stageAsset({
        ...stage,
        asset: config.extension,
      })
      const destinations = runtimeDestinations(desktopRoot, config)
      replaceRuntimeFiles([
        {
          sourcePath: cliSource,
          destinationPath: destinations.cli,
          mode: selected.key.startsWith("win32-") ? 0o644 : 0o755,
        },
        {
          sourcePath: extensionSource,
          destinationPath: destinations.extension,
          mode: 0o755,
        },
      ])
      if (!cacheReady()) {
        throw new Error("Installed Graft runtime failed final verification")
      }
      console.log(
        `postinstall-graft: Installed verified ${value.tag} for ${selected.key}`
      )
      return { cacheHit: false, platform: selected.key, version: value.version }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  } finally {
    releaseInstallLock(lockPath, lock.token)
  }
}

function installGraftRuntime(options = {}) {
  const value = options.manifest || manifest
  const desktopRoot = options.desktopRoot || path.resolve(__dirname, "..")
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const key = `${desktopRoot}:${value.tag}:${platform}:${arch}`
  const existing = installFlights.get(key)
  if (existing) return existing
  const flight = installGraftRuntimeInternal(options).finally(() => {
    if (installFlights.get(key) === flight) installFlights.delete(key)
  })
  installFlights.set(key, flight)
  return flight
}

module.exports = {
  extractArchive,
  installGraftRuntime,
  isRuntimeCacheValid,
  manifest,
  platformConfig,
  replaceRuntimeFiles,
  runtimeDestinations,
  sha256File,
  validateManifest,
  validateRequestedRelease,
  verifyFileSha256,
}
