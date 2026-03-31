/**
 * CLI Installer Service
 * Handles installation/uninstallation of Eidos CLI to system PATH
 * Inspired by VSCode's "Install code command in PATH" feature
 */

import fs from "fs/promises"
import fsSync from "fs"
import path from "path"
import { exec, spawn } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

/**
 * Get the CLI binary path based on platform and architecture
 */
export function getCliBinaryPath(): string {
  const platform = process.platform
  const arch = process.arch
  const resourcesPath = process.resourcesPath || path.join(__dirname, "../../")

  let binaryName: string
  if (platform === "win32") {
    // Windows: prefer eidos.exe alias, fallback to platform-specific name
    binaryName = "eidos-windows-x64.exe"
  } else if (platform === "darwin") {
    // macOS: check architecture for Intel vs ARM
    binaryName = arch === "arm64" ? "eidos-macos-arm" : "eidos-macos-intel"
  } else {
    // Linux
    binaryName = "eidos-linux-x64"
  }

  const primaryPath = path.join(resourcesPath, "dist-cli", binaryName)

  // On Windows, also check for eidos.exe alias
  if (platform === "win32") {
    const aliasPath = path.join(resourcesPath, "dist-cli", "eidos.exe")
    // Use alias if it exists, otherwise use platform-specific name
    if (fsSync.existsSync(aliasPath)) {
      return aliasPath
    }
  }

  return primaryPath
}

/**
 * Check if CLI is already installed in PATH
 */
export async function isCliInstalled(): Promise<boolean> {
  try {
    const platform = process.platform
    const cliName = platform === "win32" ? "eidos.exe" : "eidos"

    if (platform === "win32") {
      // Windows: check using WHERE command
      const { stdout } = await execAsync(`where ${cliName}`)
      return stdout.includes(cliName)
    } else {
      // macOS/Linux: check using which command
      const { stdout } = await execAsync(`which ${cliName}`)
      return stdout.trim().length > 0
    }
  } catch {
    return false
  }
}

/**
 * Install CLI to system PATH on macOS using osascript
 * Creates symlink in /usr/local/bin with admin privileges
 */
async function installCliMacOS(
  cliSourcePath: string
): Promise<{ success: boolean; message: string }> {
  const targetDir = "/usr/local/bin"
  const targetPath = path.join(targetDir, "eidos")

  // Check if /usr/local/bin exists, create if needed
  try {
    await fs.access(targetDir)
  } catch {
    // Directory doesn't exist, need to create it with sudo
    const mkdirScript = `do shell script "mkdir -p ${targetDir}" with administrator privileges`
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("osascript", ["-e", mkdirScript])
        proc.on("close", (code) => {
          if (code === 0) resolve()
          else reject(new Error("Failed to create /usr/local/bin directory"))
        })
      })
    } catch (error) {
      return {
        success: false,
        message: "Failed to create /usr/local/bin directory. Please try again.",
      }
    }
  }

  // Remove existing symlink if present
  try {
    await fs.unlink(targetPath)
  } catch {
    // File doesn't exist, that's fine
  }

  // Create symlink with admin privileges using osascript
  const linkScript = `do shell script "ln -sf '${cliSourcePath}' '${targetPath}' && chmod +x '${targetPath}'" with administrator privileges`

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("osascript", ["-e", linkScript])
      let stderr = ""
      proc.stderr?.on("data", (data) => {
        stderr += data.toString()
      })
      proc.on("close", (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr || "osascript failed"))
      })
    })

    return {
      success: true,
      message:
        "Eidos CLI has been successfully installed to /usr/local/bin/eidos. You may need to restart your terminal.",
    }
  } catch (error) {
    console.error("Failed to install CLI:", error)
    return {
      success: false,
      message:
        "Failed to install CLI. Please check your permissions and try again.",
    }
  }
}

/**
 * Install CLI to system PATH on Windows
 * Copies CLI as eidos.exe and adds to user PATH environment variable
 */
async function installCliWindows(
  cliSourcePath: string
): Promise<{ success: boolean; message: string }> {
  const cliDir = path.dirname(cliSourcePath)
  const eidosExePath = path.join(cliDir, "eidos.exe")

  // Copy the binary as eidos.exe so users can use 'eidos' command
  try {
    await fs.copyFile(cliSourcePath, eidosExePath)
  } catch (error) {
    // If copy fails, the file might already exist, which is fine
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      console.error("Failed to copy CLI binary:", error)
    }
  }

  const psScript = `
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not $userPath.Contains('${cliDir.replace(/'/g, "''")}')) {
      [Environment]::SetEnvironmentVariable('Path', $userPath + ';${cliDir.replace(/'/g, "''")}', 'User')
      Write-Host 'Eidos CLI path added to user PATH'
    } else {
      Write-Host 'Eidos CLI path already in user PATH'
    }
  `

  try {
    await execAsync(`powershell.exe -Command "${psScript}"`)
    return {
      success: true,
      message:
        "Eidos CLI has been added to your PATH. Please restart your terminal for changes to take effect.",
    }
  } catch (error) {
    console.error("Failed to install CLI on Windows:", error)
    return {
      success: false,
      message:
        "Failed to add Eidos CLI to PATH. Please try running as administrator.",
    }
  }
}

/**
 * Install CLI to system PATH on Linux
 * Creates symlink in /usr/local/bin (may require sudo)
 */
async function installCliLinux(
  cliSourcePath: string
): Promise<{ success: boolean; message: string }> {
  const targetPath = "/usr/local/bin/eidos"

  // Remove existing symlink if present
  try {
    await fs.unlink(targetPath)
  } catch {
    // File doesn't exist, that's fine
  }

  try {
    // Try without sudo first (in case user has permissions)
    await fs.symlink(cliSourcePath, targetPath)
    await fs.chmod(targetPath, 0o755)
    return {
      success: true,
      message:
        "Eidos CLI has been successfully installed to /usr/local/bin/eidos. You may need to restart your terminal.",
    }
  } catch {
    // Need sudo, try with pkexec or sudo
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("pkexec", ["ln", "-sf", cliSourcePath, targetPath])
        proc.on("close", (code) => {
          if (code === 0) resolve()
          else {
            // Try with sudo as fallback
            const sudoProc = spawn("sudo", [
              "ln",
              "-sf",
              cliSourcePath,
              targetPath,
            ])
            sudoProc.on("close", (sudoCode) => {
              if (sudoCode === 0) resolve()
              else reject(new Error("Failed to create symlink"))
            })
          }
        })
      })

      return {
        success: true,
        message:
          "Eidos CLI has been successfully installed to /usr/local/bin/eidos. You may need to restart your terminal.",
      }
    } catch (error) {
      return {
        success: false,
        message:
          "Failed to install CLI. Please run: sudo ln -sf '" +
          cliSourcePath +
          "' /usr/local/bin/eidos",
      }
    }
  }
}

/**
 * Install CLI to system PATH
 * On macOS: uses osascript to prompt for admin privileges and creates symlink in /usr/local/bin
 * On Windows: adds to PATH via registry or user environment
 * On Linux: creates symlink in /usr/local/bin
 */
export async function installCli(): Promise<{
  success: boolean
  message: string
}> {
  const platform = process.platform
  const cliSourcePath = getCliBinaryPath()

  // Check if CLI binary exists
  try {
    await fs.access(cliSourcePath)
  } catch {
    return {
      success: false,
      message: "CLI binary not found. Please reinstall Eidos.",
    }
  }

  switch (platform) {
    case "darwin":
      return installCliMacOS(cliSourcePath)
    case "win32":
      return installCliWindows(cliSourcePath)
    default:
      return installCliLinux(cliSourcePath)
  }
}

/**
 * Uninstall CLI from system PATH on macOS using osascript
 */
async function uninstallCliMacOS(): Promise<{
  success: boolean
  message: string
}> {
  const targetPath = "/usr/local/bin/eidos"
  const unlinkScript = `do shell script "rm -f '${targetPath}'" with administrator privileges`

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("osascript", ["-e", unlinkScript])
      proc.on("close", (code) => {
        if (code === 0) resolve()
        else reject(new Error("osascript failed"))
      })
    })

    return {
      success: true,
      message: "Eidos CLI has been successfully uninstalled.",
    }
  } catch (error) {
    return {
      success: false,
      message: "Failed to uninstall CLI. Please try again.",
    }
  }
}

/**
 * Uninstall CLI from system PATH on Windows
 */
async function uninstallCliWindows(): Promise<{
  success: boolean
  message: string
}> {
  const cliSourcePath = getCliBinaryPath()
  const cliDir = path.dirname(cliSourcePath)
  const eidosExePath = path.join(cliDir, "eidos.exe")

  // Remove the eidos.exe copy
  try {
    await fs.unlink(eidosExePath)
  } catch {
    // File might not exist, that's fine
  }

  const psScript = `
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $newPath = ($userPath -split ';' | Where-Object { $_ -ne '${cliDir.replace(/'/g, "''")}' }) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  `

  try {
    await execAsync(`powershell.exe -Command "${psScript}"`)
    return {
      success: true,
      message: "Eidos CLI has been removed from your PATH.",
    }
  } catch (error) {
    return {
      success: false,
      message: "Failed to remove Eidos CLI from PATH.",
    }
  }
}

/**
 * Uninstall CLI from system PATH on Linux
 */
async function uninstallCliLinux(): Promise<{
  success: boolean
  message: string
}> {
  const targetPath = "/usr/local/bin/eidos"
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("pkexec", ["rm", "-f", targetPath])
      proc.on("close", (code) => {
        if (code === 0) resolve()
        else {
          const sudoProc = spawn("sudo", ["rm", "-f", targetPath])
          sudoProc.on("close", (sudoCode) => {
            if (sudoCode === 0) resolve()
            else reject(new Error("Failed to remove symlink"))
          })
        }
      })
    })

    return {
      success: true,
      message: "Eidos CLI has been successfully uninstalled.",
    }
  } catch (error) {
    return {
      success: false,
      message:
        "Failed to uninstall CLI. Please run: sudo rm -f /usr/local/bin/eidos",
    }
  }
}

/**
 * Uninstall CLI from system PATH
 */
export async function uninstallCli(): Promise<{
  success: boolean
  message: string
}> {
  const platform = process.platform

  switch (platform) {
    case "darwin":
      return uninstallCliMacOS()
    case "win32":
      return uninstallCliWindows()
    default:
      return uninstallCliLinux()
  }
}
