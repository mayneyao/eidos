/**
 * CLI Installer Service
 * Handles installation/uninstallation of Eidos CLI to system PATH
 */

import fs from "fs/promises"
import fsSync from "fs"
import path from "path"
import { exec, spawn } from "child_process"
import { promisify } from "util"
import { Injectable } from "../../common/di"

const execAsync = promisify(exec)

@Injectable()
export class CliInstaller {
  /**
   * Get the CLI binary path based on platform and architecture
   */
  getCliBinaryPath(): string {
    const platform = process.platform
    const arch = process.arch
    const resourcesPath =
      process.resourcesPath || path.join(__dirname, "../../")

    let binaryName: string
    if (platform === "win32") {
      binaryName = "eidos-windows-x64.exe"
    } else if (platform === "darwin") {
      binaryName = arch === "arm64" ? "eidos-macos-arm" : "eidos-macos-intel"
    } else {
      binaryName = "eidos-linux-x64"
    }

    const primaryPath = path.join(resourcesPath, "dist-cli", binaryName)

    if (platform === "win32") {
      const aliasPath = path.join(resourcesPath, "dist-cli", "eidos.exe")
      if (fsSync.existsSync(aliasPath)) {
        return aliasPath
      }
    }

    return primaryPath
  }

  /**
   * Check if CLI is already installed in PATH
   */
  async isCliInstalled(): Promise<boolean> {
    try {
      const platform = process.platform
      const cliName = platform === "win32" ? "eidos.exe" : "eidos"

      if (platform === "win32") {
        const { stdout } = await execAsync(`where ${cliName}`)
        return stdout.includes(cliName)
      } else {
        const { stdout } = await execAsync(`which ${cliName}`)
        return stdout.trim().length > 0
      }
    } catch {
      return false
    }
  }

  /**
   * Install CLI to system PATH
   */
  async installCli(): Promise<{ success: boolean; message: string }> {
    const platform = process.platform
    const cliSourcePath = this.getCliBinaryPath()

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
        return this.installCliMacOS(cliSourcePath)
      case "win32":
        return this.installCliWindows(cliSourcePath)
      default:
        return this.installCliLinux(cliSourcePath)
    }
  }

  /**
   * Uninstall CLI from system PATH
   */
  async uninstallCli(): Promise<{ success: boolean; message: string }> {
    const platform = process.platform

    switch (platform) {
      case "darwin":
        return this.uninstallCliMacOS()
      case "win32":
        return this.uninstallCliWindows()
      default:
        return this.uninstallCliLinux()
    }
  }

  // Private helper methods
  private async installCliMacOS(
    cliSourcePath: string
  ): Promise<{ success: boolean; message: string }> {
    const targetDir = "/usr/local/bin"
    const targetPath = path.join(targetDir, "eidos")

    try {
      await fs.access(targetDir)
    } catch {
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
          message:
            "Failed to create /usr/local/bin directory. Please try again.",
        }
      }
    }

    try {
      await fs.unlink(targetPath)
    } catch {
      // File doesn't exist, that's fine
    }

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

  private async installCliWindows(
    cliSourcePath: string
  ): Promise<{ success: boolean; message: string }> {
    const cliDir = path.dirname(cliSourcePath)
    const eidosExePath = path.join(cliDir, "eidos.exe")

    try {
      await fs.copyFile(cliSourcePath, eidosExePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        console.error("Failed to copy CLI binary:", error)
      }
    }

    const psScript = `
      $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
      if (-not $userPath.Contains('${cliDir.replace(/'/g, "'")}')) {
        [Environment]::SetEnvironmentVariable('Path', $userPath + ';${cliDir.replace(/'/g, "'")}', 'User')
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

  private async installCliLinux(
    cliSourcePath: string
  ): Promise<{ success: boolean; message: string }> {
    const targetPath = "/usr/local/bin/eidos"

    try {
      await fs.unlink(targetPath)
    } catch {
      // File doesn't exist, that's fine
    }

    try {
      await fs.symlink(cliSourcePath, targetPath)
      await fs.chmod(targetPath, 0o755)
      return {
        success: true,
        message:
          "Eidos CLI has been successfully installed to /usr/local/bin/eidos. You may need to restart your terminal.",
      }
    } catch {
      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn("pkexec", ["ln", "-sf", cliSourcePath, targetPath])
          proc.on("close", (code) => {
            if (code === 0) resolve()
            else {
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

  private async uninstallCliMacOS(): Promise<{
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

  private async uninstallCliWindows(): Promise<{
    success: boolean
    message: string
  }> {
    const cliSourcePath = this.getCliBinaryPath()
    const cliDir = path.dirname(cliSourcePath)
    const eidosExePath = path.join(cliDir, "eidos.exe")

    try {
      await fs.unlink(eidosExePath)
    } catch {
      // File might not exist, that's fine
    }

    const psScript = `
      $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
      $newPath = ($userPath -split ';' | Where-Object { $_ -ne '${cliDir.replace(/'/g, "'")}' }) -join ';'
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

  private async uninstallCliLinux(): Promise<{
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
}
