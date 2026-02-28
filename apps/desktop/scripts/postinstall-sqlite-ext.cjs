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

const DEST_DIR = "dist-sqlite-ext" // Destination directory relative to project root (Note: This constant seems unused in the rest of the logic)

// Mapping from Node's process.platform/process.arch to package suffixes
const platformArchMapping = {
  "win32 arm64": "windows-arm64",
  "win32 x64": "windows-x64",
  "darwin arm64": "darwin-arm64", // macOS Apple Silicon
  "darwin x64": "darwin-x64", // macOS Intel
  "linux arm64": "linux-arm64",
  "linux x64": "linux-x64",
}

// Mapping from Node's process.platform to file extensions
const platformExtensionMapping = {
  win32: "dll",
  darwin: "dylib",
  linux: "so",
}

// Updated function to accept the full package configuration object
function getPlatformInfo(pkgConfig) {
  const platformKey = `${process.platform} ${process.arch}`
  const suffix = platformArchMapping[platformKey]
  const extension = platformExtensionMapping[process.platform]

  if (!suffix || !extension) {
    // Use basePackageName from pkgConfig for the warning
    console.warn(
      `postinstall-${pkgConfig.basePackageName}: Unsupported platform ${platformKey}. Skipping copy.`
    )
    return null
  }

  // Determine destination base name (still needed)
  let destBaseName = pkgConfig.destBaseName

  // Platform-specific destination overrides could still be useful if needed later
  // if (pkgConfig.overrides && pkgConfig.overrides[process.platform]) {
  //   const platformOverrides = pkgConfig.overrides[process.platform];
  //   if (platformOverrides.destBaseName) {
  //     destBaseName = platformOverrides.destBaseName;
  //     console.log(`postinstall-${pkgConfig.basePackageName}: Using platform override for destBaseName: ${destBaseName}`);
  //   }
  // }

  const packageName = `${pkgConfig.basePackageName}-${suffix}`
  // No longer determine sourceFileName here
  const destFileName = `${destBaseName}.${extension}`

  // Return necessary info, including the extension for findSourcePath
  return {
    packageName,
    destFileName,
    extension,
    basePackageName: pkgConfig.basePackageName,
  }
}

// Function to find workspace root
function findWorkspaceRoot() {
  let currentDir = __dirname

  while (currentDir !== path.dirname(currentDir)) {
    // Check for workspace indicators
    const packageJsonPath = path.join(currentDir, "package.json")
    const pnpmWorkspacePath = path.join(currentDir, "pnpm-workspace.yaml")

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
        // Check if it has workspaces property or if pnpm-workspace.yaml exists
        if (packageJson.workspaces || fs.existsSync(pnpmWorkspacePath)) {
          return currentDir
        }
      } catch (e) {
        // Continue searching if package.json is malformed
      }
    }

    currentDir = path.dirname(currentDir)
  }

  // Fallback to current working directory if no workspace root found
  console.warn(
    "Could not find workspace root, falling back to current working directory"
  )
  return process.cwd()
}

// Updated function to find the source file by extension
function findSourcePath(basePackageName, packageName, extension) {
  const workspaceRoot = findWorkspaceRoot()
  const pnpmDir = path.join(workspaceRoot, "node_modules", ".pnpm")
  let packageVersionDir = ""

  // Add basePackageName to logs
  console.log(
    `postinstall-${basePackageName}: Using workspace root: ${workspaceRoot}`
  )
  console.log(
    `postinstall-${basePackageName}: Searching for package directory starting with ${packageName}@ in ${pnpmDir}`
  )

  try {
    const pnpmEntries = fs.readdirSync(pnpmDir)
    const prefix = `${packageName}@`

    // Find all entries that match the prefix
    const matchingEntries = pnpmEntries.filter((entry) =>
      entry.startsWith(prefix)
    )

    if (matchingEntries.length === 0) {
      // Add basePackageName to logs
      console.error(
        `postinstall-${basePackageName}: Could not find directory starting with ${prefix} in ${pnpmDir}`
      )
      console.log(
        `postinstall-${basePackageName}: Listing entries in .pnpm: `,
        pnpmEntries.slice(0, 20).join(", ") + "..."
      ) // Log first few entries for debugging
      return null
    }

    // Sort by version (semver) to get the latest version
    matchingEntries.sort((a, b) => {
      // Extract version from entries like "sqlite-vec-darwin-arm64@0.1.1-alpha.2"
      const versionA = a.split("@")[1] || "0.0.0"
      const versionB = b.split("@")[1] || "0.0.0"

      // Simple semver comparison (can be improved for more complex cases)
      const partsA = versionA.split(".").map(Number)
      const partsB = versionB.split(".").map(Number)

      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const a = partsA[i] || 0
        const b = partsB[i] || 0
        if (a > b) return -1 // a is newer
        if (a < b) return 1 // b is newer
      }
      return 0 // same version
    })

    packageVersionDir = matchingEntries[0] // First (latest) after sorting

    // Add basePackageName to logs
    console.log(
      `postinstall-${basePackageName}: Found ${matchingEntries.length} versions, using latest: ${packageVersionDir}`
    )
  } catch (e) {
    if (e.code === "ENOENT") {
      // Add basePackageName to logs
      console.error(
        `postinstall-${basePackageName}: .pnpm directory not found at ${pnpmDir}. Run pnpm install first?`
      )
    } else {
      // Add basePackageName to logs
      console.error(
        `postinstall-${basePackageName}: Failed to read .pnpm directory: ${pnpmDir}`,
        e
      )
    }
    return null // Indicate failure to find source path
  }

  // Construct the path to the nested package directory
  const packageDir = path.join(
    pnpmDir,
    packageVersionDir,
    "node_modules",
    packageName
  )

  // Add basePackageName to logs
  console.log(
    `postinstall-${basePackageName}: Searching for *.${extension} file in ${packageDir}`
  )

  try {
    const packageFiles = fs.readdirSync(packageDir)
    const targetFiles = packageFiles.filter((file) =>
      file.endsWith(`.${extension}`)
    )

    if (targetFiles.length === 1) {
      const sourceFileName = targetFiles[0]
      const fullSourcePath = path.join(packageDir, sourceFileName)
      // Add basePackageName to logs
      console.log(
        `postinstall-${basePackageName}: Found unique source file: ${sourceFileName}`
      )
      return fullSourcePath // Found it!
    } else if (targetFiles.length === 0) {
      // Add basePackageName to logs
      console.error(
        `postinstall-${basePackageName}: No file found with extension .${extension} in ${packageDir}`
      )
      console.log(
        `postinstall-${basePackageName}: Files in directory: ${packageFiles.join(", ")}`
      ) // Log files for debugging
      return null
    } else {
      // Add basePackageName to logs
      console.error(
        `postinstall-${basePackageName}: Found multiple files with extension .${extension} in ${packageDir}: ${targetFiles.join(", ")}. Aborting.`
      )
      return null
    }
  } catch (e) {
    // Add basePackageName to logs
    console.error(
      `postinstall-${basePackageName}: Failed to read package directory: ${packageDir}`,
      e
    )
    return null
  }
}

// --- Main Script Logic ---
console.log("--- Starting postinstall script for native dependencies ---")
const workspaceRoot = findWorkspaceRoot()
console.log(`Using workspace root: ${workspaceRoot}`)
let overallSuccess = true

packagesToProcess.forEach((pkgConfig) => {
  console.log(`
--- Processing package: ${pkgConfig.basePackageName} ---`)
  // Pass the whole pkgConfig object to getPlatformInfo
  const platformInfo = getPlatformInfo(pkgConfig)

  if (!platformInfo) {
    console.log(
      `postinstall-${pkgConfig.basePackageName}: Skipping copy due to unsupported platform or config issue.` // Use pkgConfig.basePackageName here
    )
    return // Continue to the next package
  }

  // Destructure needed info, including basePackageName and extension from platformInfo
  const { packageName, destFileName, extension, basePackageName } = platformInfo

  // Pass basePackageName and extension from platformInfo for logging and searching
  const nestedSourceFilePath = findSourcePath(
    basePackageName,
    packageName,
    extension // Pass the extension
  )
  if (!nestedSourceFilePath) {
    console.log(
      `postinstall-${basePackageName}: Source file with extension .${extension} not found for ${packageName}. Skipping copy.`
    )
    return // Continue to the next package
  }

  // Derive the source *directory* from the file path found
  // const sourceDir = path.dirname(nestedSourceFilePath); // No longer needed

  // Define the destination directory path in the root node_modules
  // The destination directory is named after the platform-specific package name
  // const destDir = path.join(process.cwd(), 'node_modules', packageName); // Old destination

  // Use the DEST_DIR constant and destFileName for the final path
  const finalDestDir = path.resolve(process.cwd(), DEST_DIR) // Ensure DEST_DIR is resolved relative to cwd
  const finalDestPath = path.join(finalDestDir, destFileName)

  try {
    // Add basePackageName to logs
    console.log(`postinstall-${basePackageName}: Preparing to copy file.`)
    console.log(
      `postinstall-${basePackageName}: Source file: ${nestedSourceFilePath}`
    )
    console.log(
      `postinstall-${basePackageName}: Destination file: ${finalDestPath}`
    )

    // Ensure the destination directory exists
    // Add basePackageName to logs
    console.log(
      `postinstall-${basePackageName}: Ensuring destination directory exists: ${finalDestDir}`
    )
    fs.mkdirSync(finalDestDir, { recursive: true })

    // Remove destination directory if it already exists to ensure a clean copy
    // if (fs.existsSync(destDir)) { // Old logic for removing directory
    //   // Add basePackageName to logs
    //   console.log(`postinstall-${basePackageName}: Removing existing destination directory: ${destDir}`);
    //   fs.rmSync(destDir, { recursive: true, force: true });
    // }

    // Recursively copy the entire package content // Old comment
    // Add basePackageName to logs
    // console.log(`postinstall-${basePackageName}: Copying directory content recursively...`); // Old log
    // fs.cpSync(sourceDir, destDir, { recursive: true }); // Old copy logic

    // Copy the file directly
    // Add basePackageName to logs
    console.log(`postinstall-${basePackageName}: Copying file...`)
    fs.copyFileSync(nestedSourceFilePath, finalDestPath)

    // Add basePackageName to logs
    // console.log(`postinstall-${basePackageName}: Successfully copied package content to ${destDir}.`); // Old log
    console.log(
      `postinstall-${basePackageName}: Successfully copied file to ${finalDestPath}.`
    )
  } catch (error) {
    // Add basePackageName to logs
    // console.error(`postinstall-${basePackageName}: Failed to copy directory for ${packageName}:`, error); // Old log
    console.error(
      `postinstall-${basePackageName}: Failed to copy file ${destFileName} for ${packageName}:`,
      error
    )
    overallSuccess = false // Mark overall process as failed if any package fails
    // Continue to the next package
  }
})

console.log("--- Postinstall script finished ---")
process.exit(overallSuccess ? 0 : 1) // Exit with 0 if all succeed, 1 otherwise
