import { ipcMain, type IpcMainInvokeEvent } from "electron"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import electronLog from "electron-log"

const logger = electronLog

// Dynamic import for node-pty to handle native module loading
let ptyModule: typeof import("node-pty") | null = null

async function getPty(): Promise<typeof import("node-pty")> {
  if (!ptyModule) {
    try {
      logger.info("[Terminal] Loading node-pty module...")
      ptyModule = await import("node-pty")
      logger.info("[Terminal] node-pty module loaded successfully")
    } catch (error) {
      logger.error("[Terminal] Failed to load node-pty module:", error)
      throw new Error(
        `Failed to load node-pty: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }
  return ptyModule
}

export interface TerminalSession {
  id: string
  ptyProcess: import("node-pty").IPty
  shell: string
  cwd: string
  createdAt: number
}

export interface TerminalCreateOptions {
  cwd?: string
  shell?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export class TerminalService {
  private sessions: Map<string, TerminalSession> = new Map()
  private defaultShell: string
  private isReady: boolean = false

  constructor() {
    logger.info("[Terminal] TerminalService constructor starting...")
    this.defaultShell = this.detectDefaultShell()
    logger.info("[Terminal] Default shell detected:", this.defaultShell)
    this.registerIpcHandlers()
    this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      logger.info("[Terminal] Initializing terminal service...")
      // Pre-load the pty module to detect issues early
      await getPty()
      this.isReady = true
      logger.info("[Terminal] Terminal service initialized successfully")
    } catch (error) {
      logger.error("[Terminal] Terminal service initialization failed:", error)
      this.isReady = false
    }
  }

  private detectDefaultShell(): string {
    const platform = os.platform()
    logger.info("[Terminal] Detecting shell for platform:", platform)

    if (platform === "win32") {
      return process.env.COMSPEC || "cmd.exe"
    }

    // macOS/Linux: use user's preferred shell
    const shell = process.env.SHELL || "/bin/bash"
    logger.info("[Terminal] SHELL env variable:", process.env.SHELL)

    if (fs.existsSync(shell)) {
      logger.info("[Terminal] Shell exists:", shell)
      return shell
    }

    // Fallback
    const fallbackShells = ["/bin/bash", "/bin/sh", "/bin/zsh"]
    for (const fallback of fallbackShells) {
      if (fs.existsSync(fallback)) {
        logger.warn("[Terminal] Using fallback shell:", fallback)
        return fallback
      }
    }

    return "/bin/sh"
  }

  private generateSessionId(): string {
    return `term_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private registerIpcHandlers(): void {
    logger.info("[Terminal] Registering IPC handlers...")

    ipcMain.handle(
      "terminal:create",
      async (
        event: IpcMainInvokeEvent,
        options: TerminalCreateOptions = {}
      ) => {
        logger.info(
          "[Terminal] IPC: terminal:create called with options:",
          options
        )
        return this.createSession(event, options)
      }
    )

    ipcMain.handle(
      "terminal:write",
      async (_event: IpcMainInvokeEvent, sessionId: string, data: string) => {
        logger.info(`[Terminal] IPC: terminal:write for session ${sessionId}`)
        return this.writeToSession(sessionId, data)
      }
    )

    ipcMain.handle(
      "terminal:resize",
      async (
        _event: IpcMainInvokeEvent,
        sessionId: string,
        cols: number,
        rows: number
      ) => {
        logger.info(
          `[Terminal] IPC: terminal:resize for session ${sessionId}, cols=${cols}, rows=${rows}`
        )
        return this.resizeSession(sessionId, cols, rows)
      }
    )

    ipcMain.handle(
      "terminal:kill",
      async (_event: IpcMainInvokeEvent, sessionId: string) => {
        logger.info(`[Terminal] IPC: terminal:kill for session ${sessionId}`)
        return this.killSession(sessionId)
      }
    )

    ipcMain.handle("terminal:list", async () => {
      logger.info("[Terminal] IPC: terminal:list called")
      return this.listSessions()
    })

    ipcMain.handle("terminal:get-default-shell", async () => {
      logger.info("[Terminal] IPC: terminal:get-default-shell called")
      return this.defaultShell
    })

    logger.info("[Terminal] IPC handlers registered")
  }

  private async createSession(
    event: IpcMainInvokeEvent,
    options: TerminalCreateOptions
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    logger.info(
      "[Terminal] Creating new session with options:",
      JSON.stringify(options, null, 2)
    )

    try {
      const pty = await getPty()

      if (!this.isReady) {
        logger.error("[Terminal] Service not ready")
        return {
          success: false,
          error: "Terminal service is not ready. Please try again.",
        }
      }

      const sessionId = this.generateSessionId()
      logger.info("[Terminal] Generated session ID:", sessionId)

      const shell = options.shell || this.defaultShell
      const cwd = options.cwd || os.homedir()
      const cols = options.cols || 80
      const rows = options.rows || 24

      // Log system info
      logger.info("[Terminal] ========== SYSTEM INFO ==========")
      logger.info("[Terminal] Platform:", os.platform())
      logger.info("[Terminal] Release:", os.release())
      logger.info("[Terminal] Arch:", os.arch())
      logger.info("[Terminal] Home dir:", os.homedir())
      logger.info("[Terminal] UID:", process.getuid?.())
      logger.info("[Terminal] GID:", process.getgid?.())
      logger.info("[Terminal] EUID:", process.geteuid?.())
      logger.info("[Terminal] =====================================")

      logger.info("[Terminal] Session config:")
      logger.info("  - shell:", shell)
      logger.info("  - cwd:", cwd)
      logger.info("  - cols:", cols)
      logger.info("  - rows:", rows)

      // Check shell exists
      if (!fs.existsSync(shell)) {
        logger.error("[Terminal] Shell does not exist:", shell)
        return {
          success: false,
          error: `Shell "${shell}" does not exist`,
        }
      }
      logger.info("[Terminal] Shell exists:", shell)

      // Check shell is executable
      try {
        fs.accessSync(shell, fs.constants.X_OK)
        logger.info("[Terminal] Shell is executable:", shell)
      } catch (e) {
        logger.error("[Terminal] Shell is not executable:", shell, e)
      }

      // Check directory exists
      let resolvedCwd = cwd
      if (cwd.startsWith("~")) {
        resolvedCwd = path.join(os.homedir(), cwd.slice(1))
      }

      if (!fs.existsSync(resolvedCwd)) {
        logger.warn("[Terminal] CWD does not exist, using home:", resolvedCwd)
        resolvedCwd = os.homedir()
      }

      const stats = fs.statSync(resolvedCwd)
      if (!stats.isDirectory()) {
        logger.warn(
          "[Terminal] CWD is not a directory, using home:",
          resolvedCwd
        )
        resolvedCwd = os.homedir()
      }
      logger.info("[Terminal] Resolved CWD:", resolvedCwd)

      // Check directory permissions
      try {
        fs.accessSync(resolvedCwd, fs.constants.R_OK | fs.constants.X_OK)
        logger.info("[Terminal] CWD is accessible:", resolvedCwd)
      } catch (permError) {
        logger.error(
          "[Terminal] CWD is not accessible:",
          resolvedCwd,
          permError
        )
        resolvedCwd = os.homedir()
        logger.info("[Terminal] Fallback to home:", resolvedCwd)
      }

      // Prepare environment
      const env = {
        ...process.env,
        ...options.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "Eidos",
        TERM_PROGRAM_VERSION: process.env.npm_package_version || "1.0.0",
        PATH:
          process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin",
      }

      logger.info("[Terminal] Environment PATH:", env.PATH)
      logger.info("[Terminal] Environment TERM:", env.TERM)

      // Try to spawn
      let ptyProcess: import("node-pty").IPty

      try {
        logger.info("[Terminal] Calling pty.spawn with:")
        logger.info("  - shell:", shell)
        logger.info("  - args: []")
        logger.info("  - cwd:", resolvedCwd)
        logger.info("  - cols:", cols)
        logger.info("  - rows:", rows)

        ptyProcess = pty.spawn(shell, [], {
          name: "xterm-256color",
          cols,
          rows,
          cwd: resolvedCwd,
          env,
        })

        logger.info("[Terminal] pty.spawn succeeded!")
      } catch (spawnError) {
        logger.error("[Terminal] pty.spawn failed:", spawnError)
        logger.error("[Terminal] Error details:", {
          name: (spawnError as Error).name,
          message: (spawnError as Error).message,
          stack: (spawnError as Error).stack,
        })

        // Try fallback to /bin/bash
        logger.info("[Terminal] Trying fallback to /bin/bash...")
        try {
          ptyProcess = pty.spawn("/bin/bash", [], {
            name: "xterm-256color",
            cols,
            rows,
            cwd: resolvedCwd,
            env,
          })
          logger.info("[Terminal] Fallback to /bin/bash succeeded!")
        } catch (fallbackError) {
          logger.error("[Terminal] Fallback also failed:", fallbackError)
          throw spawnError
        }
      }

      // Store session
      const session: TerminalSession = {
        id: sessionId,
        ptyProcess,
        shell,
        cwd: resolvedCwd,
        createdAt: Date.now(),
      }
      this.sessions.set(sessionId, session)
      logger.info("[Terminal] Session stored:", sessionId)

      // Handle data from PTY
      ptyProcess.onData((data: string) => {
        logger.info(
          `[Terminal] Data from session ${sessionId}:`,
          data.length,
          "bytes"
        )
        event.sender.send("terminal:data", sessionId, data)
      })

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        logger.info(
          `[Terminal] Session ${sessionId} exited, code=${exitCode}, signal=${signal}`
        )
        event.sender.send("terminal:exit", sessionId, exitCode, signal)
        this.sessions.delete(sessionId)
      })

      logger.info(`[Terminal] Session ${sessionId} created successfully`)
      return { success: true, sessionId }
    } catch (error) {
      logger.error("[Terminal] Failed to create terminal session:", error)
      logger.error("[Terminal] Error stack:", (error as Error).stack)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  private writeToSession(
    sessionId: string,
    data: string
  ): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      logger.warn("[Terminal] Write to unknown session:", sessionId)
      return { success: false, error: "Session not found" }
    }

    try {
      session.ptyProcess.write(data)
      return { success: true }
    } catch (error) {
      logger.error(`[Terminal] Failed to write to session ${sessionId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  private resizeSession(
    sessionId: string,
    cols: number,
    rows: number
  ): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { success: false, error: "Session not found" }
    }

    try {
      session.ptyProcess.resize(cols, rows)
      return { success: true }
    } catch (error) {
      logger.error(`[Terminal] Failed to resize session ${sessionId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  private killSession(sessionId: string): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { success: false, error: "Session not found" }
    }

    try {
      session.ptyProcess.kill()
      this.sessions.delete(sessionId)
      logger.info("[Terminal] Killed session:", sessionId)
      return { success: true }
    } catch (error) {
      logger.error(`[Terminal] Failed to kill session ${sessionId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  private listSessions(): Array<{
    id: string
    shell: string
    cwd: string
    createdAt: number
  }> {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      shell: session.shell,
      cwd: session.cwd,
      createdAt: session.createdAt,
    }))
  }

  public cleanup(): void {
    logger.info(`[Terminal] Cleaning up ${this.sessions.size} sessions`)
    for (const [sessionId, session] of this.sessions) {
      try {
        session.ptyProcess.kill()
        logger.info("[Terminal] Killed session:", sessionId)
      } catch (error) {
        logger.error(`[Terminal] Failed to kill session ${sessionId}:`, error)
      }
    }
    this.sessions.clear()
  }
}

// Export singleton instance
export const terminalService = new TerminalService()
logger.info("[Terminal] TerminalService singleton created")
