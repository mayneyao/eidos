const fs = require("node:fs")
const path = require("node:path")
const process = require("node:process")
const { installGraftRuntime } = require("./graft-runtime-installer.cjs")

const DEST_DIR = "dist-sqlite-ext"

const platformInfoByKey = {
  "win32 arm64": {
    npmSuffix: "windows-arm64",
    extension: "dll",
  },
  "win32 x64": {
    npmSuffix: "windows-x64",
    extension: "dll",
  },
  "darwin arm64": {
    npmSuffix: "darwin-arm64",
    extension: "dylib",
  },
  "darwin x64": {
    npmSuffix: "darwin-x64",
    extension: "dylib",
  },
  "linux arm64": {
    npmSuffix: "linux-arm64",
    extension: "so",
  },
  "linux x64": {
    npmSuffix: "linux-x64",
    extension: "so",
  },
}

const packagesToProcess = [
  {
    basePackageName: "sqlite-vec",
    destBaseName: "libvec",
  },
]

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

function installFileAtomically(sourcePath, finalDestPath, mode) {
  const destDir = path.dirname(finalDestPath)
  const destBaseName = path.basename(finalDestPath)
  const tempDestPath = path.join(
    destDir,
    `.${destBaseName}.${process.pid}.${Date.now()}.tmp`
  )

  try {
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(sourcePath, tempDestPath)
    fs.chmodSync(
      tempDestPath,
      mode === undefined ? fs.statSync(sourcePath).mode & 0o777 : mode
    )
    fs.renameSync(tempDestPath, finalDestPath)
  } catch (error) {
    fs.rmSync(tempDestPath, { force: true })
    throw error
  }
}

async function installExtension(pkgConfig, workspaceRoot) {
  console.log(`\n--- Processing package: ${pkgConfig.basePackageName} ---`)
  const platformInfo = getPlatformInfo(pkgConfig)

  if (!platformInfo) {
    return true
  }

  const finalDestDir = path.resolve(__dirname, "..", DEST_DIR)
  const finalDestPath = path.join(finalDestDir, platformInfo.destFileName)
  fs.mkdirSync(finalDestDir, { recursive: true })

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
  installFileAtomically(sourcePath, finalDestPath)
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
  try {
    await installGraftRuntime()
  } catch (error) {
    console.error("postinstall-graft:", error)
    overallSuccess = false
  }
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
