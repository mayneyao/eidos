/**
 * Terminal Service - Manages terminal sessions using node-pty
 */

import { BrowserWindow } from "electron"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import electronLog from "electron-log"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject, Injectable } from "../../common/di"

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

@Injectable()
export class TerminalWindowProvider {
  private windowGetter: (() => BrowserWindow | null) | null = null

  setWindowProvider(fn: () => BrowserWindow | null) {
    this.windowGetter = fn
  }

  getWindow(): BrowserWindow | null {
    return this.windowGetter ? this.windowGetter() : null
  }
}

/**
 * Terminal Service - Provides terminal sessions via IPC
 *
 * IPC Channels:
 * - terminal:create: Create new terminal session
 * - terminal:write: Write data to session
 * - terminal:resize: Resize session
 * - terminal:kill: Kill session
 * - terminal:list: List all sessions
 * - terminal:getDefaultShell: Get default shell
 */
@IpcInjectable("terminal")
export class TerminalService extends IpcServiceBase {
  private sessions: Map<string, TerminalSession> = new Map()
  private defaultShell: string
  private isReady: boolean = false

  constructor(
    @Inject(TerminalWindowProvider)
    private windowProvider: TerminalWindowProvider
  ) {
    super()
    logger.info("[Terminal] TerminalService constructor starting...")
    this.defaultShell = this.detectDefaultShell()
    logger.info("[Terminal] Default shell detected:", this.defaultShell)
    this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      logger.info("[Terminal] Initializing terminal service...")
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

    const shell = process.env.SHELL || "/bin/bash"
    logger.info("[Terminal] SHELL env variable:", process.env.SHELL)

    if (fs.existsSync(shell)) {
      logger.info("[Terminal] Shell exists:", shell)
      return shell
    }

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

  /**
   * Create a new terminal session
   * IPC: terminal:create
   */
  async create(
    options: TerminalCreateOptions = {}
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

      logger.info("[Terminal] Session config:", { shell, cwd, cols, rows })

      if (!fs.existsSync(shell)) {
        logger.error("[Terminal] Shell does not exist:", shell)
        return {
          success: false,
          error: `Shell "${shell}" does not exist`,
        }
      }

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

      const env = {
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        ...process.env,
        ...options.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "Eidos",
        TERM_PROGRAM_VERSION: process.env.npm_package_version || "1.0.0",
        PATH:
          process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin",
      }

      let ptyProcess: import("node-pty").IPty

      try {
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
        const window = this.windowProvider.getWindow()
        window?.webContents.send("terminal:data", sessionId, data)
      })

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        logger.info(
          `[Terminal] Session ${sessionId} exited, code=${exitCode}, signal=${signal}`
        )
        const window = this.windowProvider.getWindow()
        window?.webContents.send("terminal:exit", sessionId, exitCode, signal)
        this.sessions.delete(sessionId)
      })

      logger.info(`[Terminal] Session ${sessionId} created successfully`)
      return { success: true, sessionId }
    } catch (error) {
      logger.error("[Terminal] Failed to create terminal session:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Write data to a terminal session
   * IPC: terminal:write
   */
  write(sessionId: string, data: string): { success: boolean; error?: string } {
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

  /**
   * Resize a terminal session
   * IPC: terminal:resize
   */
  resize(
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

  /**
   * Kill a terminal session
   * IPC: terminal:kill
   */
  kill(sessionId: string): { success: boolean; error?: string } {
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

  /**
   * List all terminal sessions
   * IPC: terminal:list
   */
  list(): Array<{ id: string; shell: string; cwd: string; createdAt: number }> {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      shell: session.shell,
      cwd: session.cwd,
      createdAt: session.createdAt,
    }))
  }

  /**
   * Get the default shell
   * IPC: terminal:getDefaultShell
   */
  getDefaultShell(): string {
    return this.defaultShell
  }

  /**
   * Cleanup all sessions
   */
  cleanup(): void {
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
