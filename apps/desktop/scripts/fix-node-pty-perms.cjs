const fs = require("node:fs")
const path = require("node:path")
const process = require("node:process")
const { execSync } = require("node:child_process")

// Fix permissions and signature for node-pty spawn-helper
// This is needed because:
// 1. pnpm doesn't preserve executable permissions
// 2. macOS Hardened Runtime may block the signed spawn-helper

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
      } catch (e) {
        // Continue searching
      }
    }

    currentDir = path.dirname(currentDir)
  }

  return process.cwd()
}

function fixNodePtyPermissions() {
  console.log("--- Fixing node-pty permissions and signature ---")
  
  const workspaceRoot = findWorkspaceRoot()
  const platformArch = `${process.platform}-${process.arch}`
  
  console.log(`Platform: ${platformArch}`)
  
  // Find node-pty in pnpm store
  const pnpmDir = path.join(workspaceRoot, "node_modules", ".pnpm")
  
  try {
    const entries = fs.readdirSync(pnpmDir)
    const nodePtyDirs = entries.filter(entry => entry.startsWith("node-pty@"))
    
    if (nodePtyDirs.length === 0) {
      console.log("node-pty not found in pnpm store, skipping")
      return
    }
    
    console.log(`Found ${nodePtyDirs.length} node-pty version(s)`)
    
    for (const nodePtyDir of nodePtyDirs) {
      const prebuildsDir = path.join(
        pnpmDir,
        nodePtyDir,
        "node_modules",
        "node-pty",
        "prebuilds",
        platformArch
      )
      
      if (!fs.existsSync(prebuildsDir)) {
        console.log(`Prebuilds not found for ${platformArch} in ${nodePtyDir}`)
        continue
      }
      
      const spawnHelperPath = path.join(prebuildsDir, "spawn-helper")
      
      if (fs.existsSync(spawnHelperPath)) {
        const stats = fs.statSync(spawnHelperPath)
        const isExecutable = !!(stats.mode & fs.constants.S_IXUSR)
        
        // Fix permissions
        if (!isExecutable) {
          console.log(`Fixing permissions for: ${spawnHelperPath}`)
          fs.chmodSync(spawnHelperPath, 0o755)
          console.log("Permissions fixed")
        } else {
          console.log(`Already executable: ${spawnHelperPath}`)
        }
        
        // Fix signature (remove hardened runtime if present)
        // This is needed because macOS may block the signed spawn-helper
        if (process.platform === "darwin") {
          try {
            console.log(`Checking signature for: ${spawnHelperPath}`)
            const signInfo = execSync(`codesign -dvvv "${spawnHelperPath}" 2>&1`, { encoding: "utf8" })
            
            // If it has Runtime Version, we need to re-sign
            if (signInfo.includes("Runtime Version")) {
              console.log("Found Hardened Runtime, removing signature...")
              execSync(`codesign --remove-signature "${spawnHelperPath}" 2>&1`)
              execSync(`codesign --force --sign - "${spawnHelperPath}" 2>&1`)
              console.log("Signature fixed")
            } else {
              console.log("No Hardened Runtime found, re-signing anyway to be safe...")
              execSync(`codesign --remove-signature "${spawnHelperPath}" 2>/dev/null || true`)
              execSync(`codesign --force --sign - "${spawnHelperPath}" 2>&1`)
              console.log("Re-signed successfully")
            }
          } catch (e) {
            console.warn(`Warning: Could not fix signature: ${e.message}`)
          }
        }
      } else {
        console.log(`spawn-helper not found at: ${spawnHelperPath}`)
      }
    }
    
    console.log("--- node-pty permissions and signature fixed ---")
  } catch (error) {
    console.error("Error fixing node-pty permissions:", error)
    // Don't fail the install, just log the error
  }
}

fixNodePtyPermissions()
