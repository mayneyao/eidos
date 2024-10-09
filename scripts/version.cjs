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
const tsFilePath = "./lib/env.ts" // Adjust the path to your TypeScript file
let tsFileContent = fs.readFileSync(tsFilePath, "utf8")

// Replace the version in your TypeScript file
tsFileContent = tsFileContent.replace(
  /EIDOS_VERSION = ".*"/,
  `EIDOS_VERSION = "${newVersion}"`
)

// Write the updated content back to the TypeScript file
fs.writeFileSync(tsFilePath, tsFileContent)

// Add the TypeScript file changes to git
execSync(`git add ${tsFilePath}`)

// Step 4: Update the package version without committing
execSync(`npm version ${newVersion} --no-git-tag-version`, { stdio: "inherit" })

// Step 5: Commit the package.json and package-lock.json changes
execSync(`git add ${packageJsonPath}`)

// Commit the TypeScript file change and package.json version update together
execSync(`git commit -m "Update to version ${newVersion}" --no-edit`)

console.log(
  `Version updated to ${newVersion} in package.json, package-lock.json, and ${tsFilePath}`
)
