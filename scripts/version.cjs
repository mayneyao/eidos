const fs = require("fs")
const { execSync } = require("child_process")
const semver = require("semver") // 需要安装semver包
const process = require("process")

// Step 0: Check for uncommitted Git changes
const gitStatus = execSync("git status --porcelain").toString()
if (gitStatus) {
  console.error(
    "Error: You have uncommitted changes. Please commit or stash them before running this script."
  )
  process.exit(1)
}

// Check if a version increment argument is provided
if (process.argv.length < 3) {
  console.error(
    "Error: No version increment argument provided. Please specify 'patch', 'minor', or 'major'."
  )
  process.exit(1)
}

const versionIncrement = process.argv[2]
if (!["patch", "minor", "major"].includes(versionIncrement)) {
  console.error(
    "Error: Invalid version increment argument. Please specify 'patch', 'minor', or 'major'."
  )
  process.exit(1)
}

// Step 1: Read the current version from package.json
const packageJsonPath = "package.json"
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
const currentVersion = packageJson.version

// Step 2: Calculate the new version
const newVersion = semver.inc(currentVersion, versionIncrement)

// Step 3: Update the version in your TypeScript file
const tsFilePath = "./packages/lib/env.ts"
let tsFileContent = fs.readFileSync(tsFilePath, "utf8")

// Replace the version in your TypeScript file
tsFileContent = tsFileContent.replace(
  /EIDOS_VERSION = ".*"/,
  `EIDOS_VERSION = "${newVersion}"`
)

// Write the updated content back to the TypeScript file
fs.writeFileSync(tsFilePath, tsFileContent)

// Step 4: Update all package.json files in the monorepo
const packageJsonPaths = [
  packageJsonPath, // root package.json
  "apps/desktop/package.json",
  "apps/web-app/package.json",
]

// Update each package.json file
packageJsonPaths.forEach((pkgPath) => {
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
    pkg.version = newVersion
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
    console.log(`Updated version in ${pkgPath}`)
  }
})

// Step 5: Add all changed files to git. The standalone CLI owns its version
// in apps/cli/Cargo.toml and is released through cli-v* tags.
execSync(`git add ${tsFilePath}`)
packageJsonPaths.forEach((pkgPath) => {
  if (fs.existsSync(pkgPath)) {
    execSync(`git add ${pkgPath}`)
  }
})

// Commit all version updates together
execSync(`git commit -m "Update to version ${newVersion}" --no-edit`)

console.log(
  `Version updated to ${newVersion} in all package.json files and ${tsFilePath}`
)
console.log("Updated files:")
console.log("- Root package.json")
console.log("- apps/desktop/package.json")
console.log("- apps/web-app/package.json")
console.log("- packages/lib/env.ts")
