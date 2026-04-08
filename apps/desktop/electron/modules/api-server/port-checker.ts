/**
 * Port Checker - Port availability checking utilities
 *
 * This module provides port checking functionality for the API server.
 * Migrated from services/port-checker.ts
 */

import { exec } from "child_process"
import net from "net"
import { promisify } from "util"
import { dialog } from "electron"

const execAsync = promisify(exec)

export interface PortOccupancyInfo {
  port: number
  pid?: number
  processName?: string
  processPath?: string
}

/**
 * Check if a port is in use
 */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(true)
      } else {
        resolve(false)
      }
    })

    server.once("listening", () => {
      server.close()
      resolve(false)
    })

    server.listen(port, "127.0.0.1")
  })
}

/**
 * Get process info occupying a port
 */
export async function getProcessByPort(
  port: number
): Promise<PortOccupancyInfo | null> {
  const platform = process.platform

  try {
    if (platform === "darwin" || platform === "linux") {
      return await getProcessByPortUnix(port)
    } else if (platform === "win32") {
      return await getProcessByPortWindows(port)
    }
  } catch (error) {
    console.error("Failed to get process by port:", error)
  }

  return { port }
}

/**
 * Get process info on macOS/Linux using lsof
 */
async function getProcessByPortUnix(
  port: number
): Promise<PortOccupancyInfo | null> {
  try {
    const { stdout } = await execAsync(
      `lsof -i :${port} -sTCP:LISTEN -n -P -F pn`
    )

    if (!stdout.trim()) {
      return { port }
    }

    const lines = stdout.trim().split("\n")
    let pid: number | undefined

    for (const line of lines) {
      if (line.startsWith("p")) {
        pid = parseInt(line.substring(1), 10)
      }
    }

    let processName: string | undefined
    if (pid) {
      try {
        const { stdout: psOutput } = await execAsync(
          `ps -p ${pid} -o comm= -o args=`
        )
        const psLines = psOutput.trim().split("\n")
        if (psLines.length > 0) {
          const parts = psLines[0].split(" ")
          processName = parts[0]
          const { stdout: pathOutput } = await execAsync(
            `ps -p ${pid} -o comm=`
          ).catch(() => ({ stdout: "" }))
          if (pathOutput.trim()) {
            processName = pathOutput.trim()
          }
        }
      } catch {
        // Ignore ps errors
      }
    }

    return { port, pid, processName }
  } catch {
    return { port }
  }
}

/**
 * Get process info on Windows using netstat and tasklist
 */
async function getProcessByPortWindows(
  port: number
): Promise<PortOccupancyInfo | null> {
  try {
    const { stdout: netstatOutput } = await execAsync(
      `netstat -ano | findstr ":${port}" | findstr "LISTENING"`
    )

    if (!netstatOutput.trim()) {
      return { port }
    }

    const lines = netstatOutput.trim().split("\n")
    const firstLine = lines[0].trim()
    const parts = firstLine.split(/\s+/)
    const pid = parseInt(parts[parts.length - 1], 10)

    if (!pid || isNaN(pid)) {
      return { port }
    }

    let processName: string | undefined
    let processPath: string | undefined

    try {
      const { stdout: tasklistOutput } = await execAsync(
        `tasklist /FI "PID eq ${pid}" /FO CSV /NH`
      )
      const match = tasklistOutput.match(/^"([^"]+)"/)
      if (match) {
        processName = match[1]
      }

      const { stdout: wmicOutput } = await execAsync(
        `wmic process where "ProcessId=${pid}" get ExecutablePath /value 2>nul`
      ).catch(() => ({ stdout: "" }))

      const pathMatch = wmicOutput.match(/ExecutablePath=([^\r\n]+)/)
      if (pathMatch) {
        processPath = pathMatch[1].trim()
      }
    } catch {
      // Ignore tasklist/wmic errors
    }

    return { port, pid, processName, processPath }
  } catch {
    return { port }
  }
}

/**
 * Format process info for display
 */
export function formatProcessInfo(info: PortOccupancyInfo): string {
  const lines: string[] = []
  lines.push(`Port: ${info.port}`)

  if (info.pid) {
    lines.push(`Process ID: ${info.pid}`)
  }

  if (info.processName) {
    lines.push(`Process Name: ${info.processName}`)
  }

  if (info.processPath) {
    lines.push(`Process Path: ${info.processPath}`)
  }

  return lines.join("\n")
}

/**
 * Generate platform-specific command to kill a process
 */
export function getKillCommand(info: PortOccupancyInfo): string | null {
  if (!info.pid) {
    return null
  }

  if (process.platform === "win32") {
    return `taskkill /F /PID ${info.pid}`
  } else {
    return `kill -9 ${info.pid}`
  }
}

/**
 * Kill a process by PID
 */
export async function killProcess(pid: number): Promise<boolean> {
  const platform = process.platform

  try {
    if (platform === "win32") {
      await execAsync(`taskkill /F /PID ${pid}`)
    } else {
      try {
        process.kill(pid, "SIGTERM")
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch {
        await execAsync(`kill -9 ${pid}`)
      }
    }
    return true
  } catch (error) {
    console.error(`Failed to kill process ${pid}:`, error)
    return false
  }
}

/**
 * Check if a process with given PID exists
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Show port in use dialog with process information
 */
export async function showPortInUseDialog(
  port: number,
  processInfo?: PortOccupancyInfo | null
): Promise<{ action: "retry" | "exit"; killed: boolean }> {
  const hasProcessInfo = processInfo && processInfo.pid
  const killCmd = hasProcessInfo ? getKillCommand(processInfo) : null

  const buildDetailMessage = () => {
    const detailLines: string[] = [
      `The port ${port} required by Eidos is already in use by another process.`,
      "",
    ]

    if (processInfo) {
      detailLines.push(formatProcessInfo(processInfo))
      detailLines.push("")
    }

    if (killCmd) {
      detailLines.push(
        `You can click "Kill Process" to automatically terminate it, or run the following command manually:`
      )
      detailLines.push(``)
      detailLines.push(`${killCmd}`)
      detailLines.push(``)
    }

    detailLines.push("Please stop the conflicting process and try again.")
    return detailLines.join("\n")
  }

  const buttons = hasProcessInfo
    ? ["Kill Process", "Retry", "Exit"]
    : ["Retry", "Exit"]

  const result = await dialog.showMessageBox({
    type: "warning",
    title: "Port Already in Use",
    message: `Eidos cannot start because port ${port} is occupied`,
    detail: buildDetailMessage(),
    buttons,
    defaultId: hasProcessInfo ? 1 : 0,
    cancelId: hasProcessInfo ? 2 : 1,
  })

  if (hasProcessInfo) {
    switch (result.response) {
      case 0:
        if (processInfo.pid) {
          if (!isProcessRunning(processInfo.pid)) {
            await dialog.showMessageBox({
              type: "info",
              title: "Process Already Terminated",
              message: "The process has already been terminated.",
              buttons: ["Retry"],
              defaultId: 0,
            })
            return { action: "retry", killed: true }
          }

          const success = await killProcess(processInfo.pid)
          if (success) {
            await new Promise((resolve) => setTimeout(resolve, 500))
            if (!isProcessRunning(processInfo.pid)) {
              await dialog.showMessageBox({
                type: "info",
                title: "Process Killed",
                message: `Process ${processInfo.processName || processInfo.pid} has been terminated.`,
                buttons: ["Continue"],
                defaultId: 0,
              })
              return { action: "retry", killed: true }
            }
          }

          const retryResult = await dialog.showMessageBox({
            type: "error",
            title: "Failed to Kill Process",
            message: `Unable to terminate process ${processInfo.processName || processInfo.pid}.`,
            detail:
              "The process may require elevated privileges (administrator/root) to terminate.",
            buttons: ["Retry", "Exit"],
            defaultId: 0,
          })
          return {
            action: retryResult.response === 0 ? "retry" : "exit",
            killed: false,
          }
        }
        return { action: "retry", killed: false }

      case 1:
        return { action: "retry", killed: false }

      case 2:
      default:
        return { action: "exit", killed: false }
    }
  } else {
    return {
      action: result.response === 0 ? "retry" : "exit",
      killed: false,
    }
  }
}
