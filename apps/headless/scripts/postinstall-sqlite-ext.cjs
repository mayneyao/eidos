/**
 * Postinstall script to copy SQLite extensions from npm packages
 * Adapted from apps/desktop/scripts/postinstall-sqlite-ext.cjs
 */

const fs = require("node:fs")
const path = require("node:path")
const process = require("node:process")

// Configuration for packages to process
const packagesToProcess = [
  {
    basePackageName: "sqlite-graft",
    destBaseName: "libgraft",
  },
  {
    basePackageName: "sqlite-vec",
    destBaseName: "libvec",
  },
]

const DEST_DIR = "dist-sqlite-ext"

// Platform mapping
const platformArchMapping = {
  "win32 arm64": "windows-arm64",
  "win32 x64": "windows-x64",
  "darwin arm64": "darwin-arm64",
  "darwin x64": "darwin-x64",
  "linux arm64": "linux-arm64",
  "linux x64": "linux-x64",
}

const platformExtensionMapping = {
  win32: "dll",
  darwin: "dylib",
  linux: "so",
}

function getPlatformInfo(pkgConfig) {
  const platformKey = `${process.platform} ${process.arch}`
  const suffix = platformArchMapping[platformKey]
  const extension = platformExtensionMapping[process.platform]

  if (!suffix || !extension) {
    console.warn(
      `postinstall-${pkgConfig.basePackageName}: Unsupported platform ${platformKey}. Skipping.`
    )
    return null
  }

  const destBaseName = pkgConfig.destBaseName
  const packageName = `${pkgConfig.basePackageName}-${suffix}`
  const destFileName = `${destBaseName}.${extension}`

  return {
    packageName,
    destFileName,
    extension,
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
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        if (packageJson.workspaces || fs.existsSync(pnpmWorkspacePath)) {
          return currentDir
        }
      } catch (e) {
        // Continue searching
      }
    }
    
    currentDir = path.dirname(currentDir)
  }
  
  console.warn("Could not find workspace root, falling back to current working directory")
  return process.cwd()
}

function findSourcePath(basePackageName, packageName, extension) {
  const workspaceRoot = findWorkspaceRoot()
  const pnpmDir = path.join(workspaceRoot, "node_modules", ".pnpm")
  let packageVersionDir = ""

  console.log(`postinstall-${basePackageName}: Using workspace root: ${workspaceRoot}`)
  console.log(`postinstall-${basePackageName}: Searching for ${packageName}@ in ${pnpmDir}`)

  try {
    const pnpmEntries = fs.readdirSync(pnpmDir)
    const prefix = `${packageName}@`
    const matchingEntries = pnpmEntries.filter((entry) => entry.startsWith(prefix))

    if (matchingEntries.length === 0) {
      console.error(`postinstall-${basePackageName}: Could not find ${prefix} in ${pnpmDir}`)
      return null
    }

    // Sort by version to get latest
    matchingEntries.sort((a, b) => {
      const versionA = a.split('@')[1] || '0.0.0'
      const versionB = b.split('@')[1] || '0.0.0'
      const partsA = versionA.split('.').map(Number)
      const partsB = versionB.split('.').map(Number)

      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const a = partsA[i] || 0
        const b = partsB[i] || 0
        if (a > b) return -1
        if (a < b) return 1
      }
      return 0
    })

    packageVersionDir = matchingEntries[0]
    console.log(`postinstall-${basePackageName}: Found ${matchingEntries.length} versions, using: ${packageVersionDir}`)
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(`postinstall-${basePackageName}: .pnpm directory not found. Run pnpm install first.`)
    } else {
      console.error(`postinstall-${basePackageName}: Failed to read .pnpm directory:`, e)
    }
    return null
  }

  const packageDir = path.join(pnpmDir, packageVersionDir, "node_modules", packageName)
  console.log(`postinstall-${basePackageName}: Searching for *.${extension} in ${packageDir}`)

  try {
    const packageFiles = fs.readdirSync(packageDir)
    const targetFiles = packageFiles.filter((file) => file.endsWith(`.${extension}`))

    if (targetFiles.length === 1) {
      const fullSourcePath = path.join(packageDir, targetFiles[0])
      console.log(`postinstall-${basePackageName}: Found source file: ${targetFiles[0]}`)
      return fullSourcePath
    } else if (targetFiles.length === 0) {
      console.error(`postinstall-${basePackageName}: No .${extension} file found in ${packageDir}`)
      return null
    } else {
      console.error(`postinstall-${basePackageName}: Multiple .${extension} files found: ${targetFiles.join(", ")}`)
      return null
    }
  } catch (e) {
    console.error(`postinstall-${basePackageName}: Failed to read package directory:`, e)
    return null
  }
}

// Main script
console.log("--- Starting postinstall script for SQLite extensions ---")
const workspaceRoot = findWorkspaceRoot()
console.log(`Using workspace root: ${workspaceRoot}`)
let overallSuccess = true

packagesToProcess.forEach((pkgConfig) => {
  console.log(`\n--- Processing package: ${pkgConfig.basePackageName} ---`)
  const platformInfo = getPlatformInfo(pkgConfig)

  if (!platformInfo) {
    console.log(`postinstall-${pkgConfig.basePackageName}: Skipping due to unsupported platform.`)
    return
  }

  const { packageName, destFileName, extension, basePackageName } = platformInfo
  const nestedSourceFilePath = findSourcePath(basePackageName, packageName, extension)
  
  if (!nestedSourceFilePath) {
    console.log(`postinstall-${basePackageName}: Source file not found. Skipping.`)
    return
  }

  const finalDestDir = path.resolve(process.cwd(), DEST_DIR)
  const finalDestPath = path.join(finalDestDir, destFileName)

  try {
    console.log(`postinstall-${basePackageName}: Copying to ${finalDestPath}`)
    fs.mkdirSync(finalDestDir, { recursive: true })
    fs.copyFileSync(nestedSourceFilePath, finalDestPath)
    console.log(`postinstall-${basePackageName}: Successfully copied file.`)
  } catch (error) {
    console.error(`postinstall-${basePackageName}: Failed to copy file:`, error)
    overallSuccess = false
  }
})

console.log("--- Postinstall script finished ---")
process.exit(overallSuccess ? 0 : 1)
