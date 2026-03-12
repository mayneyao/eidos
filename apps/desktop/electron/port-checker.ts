import { exec } from "child_process"
import net from "net"
import { promisify } from "util"

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
 * Returns process ID and name if found
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
    // Use lsof to find the process using the port
    const { stdout } = await execAsync(
      `lsof -i :${port} -sTCP:LISTEN -n -P -F pn`
    )

    if (!stdout.trim()) {
      return { port }
    }

    // Parse lsof output format (-F option)
    // p<pid>\nn<name> format
    const lines = stdout.trim().split("\n")
    let pid: number | undefined
    let processName: string | undefined

    for (const line of lines) {
      if (line.startsWith("p")) {
        pid = parseInt(line.substring(1), 10)
      } else if (line.startsWith("n")) {
        // n format is like "*:13127" or "127.0.0.1:13127"
        // We don't need this for process name
      }
    }

    // Get process name from PID if we found one
    if (pid) {
      try {
        const { stdout: psOutput } = await execAsync(
          `ps -p ${pid} -o comm= -o args=`
        )
        const psLines = psOutput.trim().split("\n")
        if (psLines.length > 0) {
          const parts = psLines[0].split(" ")
          processName = parts[0]
          // Get full path if available
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

    return {
      port,
      pid,
      processName,
    }
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
    // Find PID using netstat
    const { stdout: netstatOutput } = await execAsync(
      `netstat -ano | findstr ":${port}" | findstr "LISTENING"`
    )

    if (!netstatOutput.trim()) {
      return { port }
    }

    // Parse netstat output - format:
    // TCP    127.0.0.1:13127    0.0.0.0:0    LISTENING    12345
    const lines = netstatOutput.trim().split("\n")
    const firstLine = lines[0].trim()
    const parts = firstLine.split(/\s+/)
    const pid = parseInt(parts[parts.length - 1], 10)

    if (!pid || isNaN(pid)) {
      return { port }
    }

    // Get process name from PID
    let processName: string | undefined
    let processPath: string | undefined

    try {
      const { stdout: tasklistOutput } = await execAsync(
        `tasklist /FI "PID eq ${pid}" /FO CSV /NH`
      )
      // Format: "process.exe","12345","Console","1","12,345 K"
      const match = tasklistOutput.match(/^"([^"]+)"/)
      if (match) {
        processName = match[1]
      }

      // Try to get full path using wmic
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

    return {
      port,
      pid,
      processName,
      processPath,
    }
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
 * Generate platform-specific command to kill a process (for display purposes)
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
 * Returns true if successful, false otherwise
 */
export async function killProcess(pid: number): Promise<boolean> {
  const platform = process.platform

  try {
    if (platform === "win32") {
      await execAsync(`taskkill /F /PID ${pid}`)
    } else {
      // Try graceful kill first
      try {
        process.kill(pid, "SIGTERM")
        // Give it a moment to terminate gracefully
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch {
        // If SIGTERM fails, force kill
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
    // Sending signal 0 checks if process exists without affecting it
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
