const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const process = require("node:process")
const { execFileSync } = require("node:child_process")
const { downloadFile } = require("./download-utils.cjs")

const DEST_DIR = "dist-sqlite-ext"
const GRAFT_REPO =
  process.env.GRAFT_SQLITE_EXTENSION_REPO || "eidos-space/graft"
const GRAFT_VERSION = normalizeTag(
  process.env.GRAFT_SQLITE_EXTENSION_VERSION || "v0.3.1"
)

const platformInfoByKey = {
  "win32 arm64": {
    npmSuffix: "windows-arm64",
    graftTarget: "aarch64-pc-windows-msvc",
    graftArchiveExt: "zip",
    extension: "dll",
  },
  "win32 x64": {
    npmSuffix: "windows-x64",
    graftTarget: "x86_64-pc-windows-msvc",
    graftArchiveExt: "zip",
    extension: "dll",
  },
  "darwin arm64": {
    npmSuffix: "darwin-arm64",
    graftTarget: "aarch64-apple-darwin",
    graftArchiveExt: "tar.gz",
    extension: "dylib",
  },
  "darwin x64": {
    npmSuffix: "darwin-x64",
    graftTarget: "x86_64-apple-darwin",
    graftArchiveExt: "tar.gz",
    extension: "dylib",
  },
  "linux arm64": {
    npmSuffix: "linux-arm64",
    graftTarget: "aarch64-unknown-linux-gnu",
    graftArchiveExt: "tar.gz",
    extension: "so",
  },
  "linux x64": {
    npmSuffix: "linux-x64",
    graftTarget: "x86_64-unknown-linux-gnu",
    graftArchiveExt: "tar.gz",
    extension: "so",
  },
}

const packagesToProcess = [
  {
    kind: "graft-release",
    basePackageName: "sqlite-graft",
    destBaseName: "libgraft",
  },
  {
    kind: "npm-package",
    basePackageName: "sqlite-vec",
    destBaseName: "libvec",
  },
]

function normalizeTag(version) {
  return version.startsWith("v") ? version : `v${version}`
}

function getPlatformInfo(pkgConfig) {
  const platformKey = `${process.platform} ${process.arch}`
  const platformInfo = platformInfoByKey[platformKey]

  if (!platformInfo) {
    console.warn(
      `postinstall-${pkgConfig.basePackageName}: Unsupported platform ${platformKey}. Skipping.`
    )
    return null
  }

  return {
    ...platformInfo,
    packageName: `${pkgConfig.basePackageName}-${platformInfo.npmSuffix}`,
    destFileName: `${pkgConfig.destBaseName}.${platformInfo.extension}`,
    basePackageName: pkgConfig.basePackageName,
  }
}

function findWorkspaceRoot() {
  let currentDir = __dirname

  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, "package.json")
    const pnpmWorkspacePath = path.join(currentDir, "pnpm-workspace.yaml")

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
        if (packageJson.workspaces || fs.existsSync(pnpmWorkspacePath)) {
          return currentDir
        }
      } catch {
        // Continue searching.
      }
    }

    currentDir = path.dirname(currentDir)
  }

  console.warn(
    "Could not find workspace root, falling back to current working directory"
  )
  return process.cwd()
}

function findNpmSourcePath(basePackageName, packageName, extension) {
  const workspaceRoot = findWorkspaceRoot()
  const pnpmDir = path.join(workspaceRoot, "node_modules", ".pnpm")
  let packageVersionDir = ""

  console.log(
    `postinstall-${basePackageName}: Searching for ${packageName}@ in ${pnpmDir}`
  )

  try {
    const pnpmEntries = fs.readdirSync(pnpmDir)
    const prefix = `${packageName}@`
    const matchingEntries = pnpmEntries.filter((entry) =>
      entry.startsWith(prefix)
    )

    if (matchingEntries.length === 0) {
      console.error(
        `postinstall-${basePackageName}: Could not find ${prefix} in ${pnpmDir}`
      )
      return null
    }

    matchingEntries.sort(comparePnpmPackageEntries)
    packageVersionDir = matchingEntries[0]
    console.log(
      `postinstall-${basePackageName}: Found ${matchingEntries.length} versions, using: ${packageVersionDir}`
    )
  } catch (error) {
    console.error(
      `postinstall-${basePackageName}: Failed to read .pnpm directory:`,
      error
    )
    return null
  }

  const packageDir = path.join(
    pnpmDir,
    packageVersionDir,
    "node_modules",
    packageName
  )

  try {
    const targetFiles = fs
      .readdirSync(packageDir)
      .filter((file) => file.endsWith(`.${extension}`))

    if (targetFiles.length !== 1) {
      console.error(
        `postinstall-${basePackageName}: Expected one .${extension} file in ${packageDir}, found ${targetFiles.length}.`
      )
      return null
    }

    return path.join(packageDir, targetFiles[0])
  } catch (error) {
    console.error(
      `postinstall-${basePackageName}: Failed to read package directory:`,
      error
    )
    return null
  }
}

function comparePnpmPackageEntries(a, b) {
  const versionA = a.split("@")[1] || "0.0.0"
  const versionB = b.split("@")[1] || "0.0.0"
  const partsA = versionA.split(".").map(Number)
  const partsB = versionB.split(".").map(Number)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    const aPart = partsA[i] || 0
    const bPart = partsB[i] || 0
    if (aPart > bPart) return -1
    if (aPart < bPart) return 1
  }
  return 0
}

async function downloadGraftRelease(platformInfo, finalDestPath) {
  const assetVersion = GRAFT_VERSION.replace(/^v/, "")
  const assetName = `sqlite-graft-${assetVersion}-${platformInfo.graftTarget}.${platformInfo.graftArchiveExt}`
  const downloadUrl = `https://github.com/${GRAFT_REPO}/releases/download/${GRAFT_VERSION}/${assetName}`
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-graft-"))
  const archivePath = path.join(tempDir, assetName)
  const extractDir = path.join(tempDir, "extract")

  try {
    fs.mkdirSync(extractDir, { recursive: true })
    console.log(`postinstall-sqlite-graft: Downloading ${downloadUrl}`)
    await downloadFile(downloadUrl, archivePath)
    extractArchive(archivePath, extractDir, platformInfo.graftArchiveExt)

    const sourcePath = findDynamicLibrary(
      extractDir,
      platformInfo.extension,
      "graft"
    )

    if (!sourcePath) {
      throw new Error(
        `No graft dynamic library found in ${assetName} after extraction`
      )
    }

    console.log(`postinstall-sqlite-graft: Source file: ${sourcePath}`)
    fs.copyFileSync(sourcePath, finalDestPath)
    console.log(
      `postinstall-sqlite-graft: Installed ${GRAFT_VERSION} to ${finalDestPath}`
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function extractArchive(archivePath, extractDir, archiveExt) {
  if (archiveExt === "zip") {
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

  if (archiveExt === "tar.gz") {
    execFileSync("tar", ["-xzf", archivePath, "-C", extractDir], {
      stdio: "inherit",
    })
    return
  }

  throw new Error(`Unsupported archive extension: ${archiveExt}`)
}

function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`
}

function findDynamicLibrary(dir, extension, requiredNamePart) {
  const matches = []
  walk(dir, (filePath) => {
    const fileName = path.basename(filePath).toLowerCase()
    if (
      fileName.endsWith(`.${extension}`) &&
      fileName.includes(requiredNamePart)
    ) {
      matches.push(filePath)
    }
  })

  if (matches.length === 1) {
    return matches[0]
  }

  if (matches.length > 1) {
    throw new Error(
      `Found multiple ${requiredNamePart} libraries: ${matches.join(", ")}`
    )
  }

  return null
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(entryPath, visit)
    } else if (entry.isFile()) {
      visit(entryPath)
    }
  }
}

async function installExtension(pkgConfig, workspaceRoot) {
  console.log(`\n--- Processing package: ${pkgConfig.basePackageName} ---`)
  const platformInfo = getPlatformInfo(pkgConfig)

  if (!platformInfo) {
    return true
  }

  const finalDestDir = path.resolve(process.cwd(), DEST_DIR)
  const finalDestPath = path.join(finalDestDir, platformInfo.destFileName)
  fs.mkdirSync(finalDestDir, { recursive: true })

  if (pkgConfig.kind === "graft-release") {
    await downloadGraftRelease(platformInfo, finalDestPath)
    return true
  }

  const sourcePath = findNpmSourcePath(
    platformInfo.basePackageName,
    platformInfo.packageName,
    platformInfo.extension
  )

  if (!sourcePath) {
    console.log(
      `postinstall-${platformInfo.basePackageName}: Source file not found. Skipping.`
    )
    return true
  }

  console.log(
    `postinstall-${platformInfo.basePackageName}: Workspace root: ${workspaceRoot}`
  )
  console.log(
    `postinstall-${platformInfo.basePackageName}: Source file: ${sourcePath}`
  )
  console.log(
    `postinstall-${platformInfo.basePackageName}: Destination file: ${finalDestPath}`
  )
  fs.copyFileSync(sourcePath, finalDestPath)
  console.log(
    `postinstall-${platformInfo.basePackageName}: Successfully copied file.`
  )
  return true
}

async function main() {
  console.log("--- Starting postinstall script for SQLite extensions ---")
  const workspaceRoot = findWorkspaceRoot()
  console.log(`Using workspace root: ${workspaceRoot}`)

  let overallSuccess = true
  for (const pkgConfig of packagesToProcess) {
    try {
      await installExtension(pkgConfig, workspaceRoot)
    } catch (error) {
      console.error(`postinstall-${pkgConfig.basePackageName}:`, error)
      overallSuccess = false
    }
  }

  console.log("--- Postinstall script finished ---")
  process.exit(overallSuccess ? 0 : 1)
}

main()
