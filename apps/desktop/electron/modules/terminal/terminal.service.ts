/**
 * Terminal Service - Manages terminal sessions using node-pty
 */

import { BrowserWindow } from "electron"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { LoggerService } from "../logger/logger.module"
import { WindowService } from "../window/window.service"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject, Injectable } from "../../common/di"

// Dynamic import for node-pty to handle native module loading
let ptyModule: typeof import("node-pty") | null = null

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

/**
 * Terminal Window Provider - Provides access to main BrowserWindow for terminal
 * Uses WindowService internally
 */
@Injectable()
export class TerminalWindowProvider {
  constructor(@Inject(WindowService) private windowService: WindowService) {}

  getWindow(): BrowserWindow | null {
    return this.windowService.getMainWindow()
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
  private logger: LoggerService

  constructor(
    @Inject(TerminalWindowProvider)
    private windowProvider: TerminalWindowProvider,
    @Inject(LoggerService)
    loggerService: LoggerService
  ) {
    super()
    this.logger = loggerService.child("Terminal")
    this.logger.info("TerminalService constructor starting...")
    this.defaultShell = this.detectDefaultShell()
    this.logger.info("Default shell detected:", this.defaultShell)
    this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      this.logger.info("Initializing terminal service...")
      await this.getPty()
      this.isReady = true
      this.logger.info("Terminal service initialized successfully")
    } catch (error) {
      this.logger.error("Terminal service initialization failed:", error)
      this.isReady = false
    }
  }

  private async getPty(): Promise<typeof import("node-pty")> {
    if (!ptyModule) {
      try {
        this.logger.info("Loading node-pty module...")
        ptyModule = await import("node-pty")
        this.logger.info("node-pty module loaded successfully")
      } catch (error) {
        this.logger.error("Failed to load node-pty module:", error)
        throw new Error(
          `Failed to load node-pty: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      }
    }
    return ptyModule
  }

  private detectDefaultShell(): string {
    const platform = os.platform()
    this.logger.info("Detecting shell for platform:", platform)

    if (platform === "win32") {
      return process.env.COMSPEC || "cmd.exe"
    }

    const shell = process.env.SHELL || "/bin/bash"
    this.logger.info("SHELL env variable:", process.env.SHELL)

    if (fs.existsSync(shell)) {
      this.logger.info("Shell exists:", shell)
      return shell
    }

    const fallbackShells = ["/bin/bash", "/bin/sh", "/bin/zsh"]
    for (const fallback of fallbackShells) {
      if (fs.existsSync(fallback)) {
        this.logger.warn("Using fallback shell:", fallback)
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
    this.logger.info(
      "Creating new session with options:",
      JSON.stringify(options, null, 2)
    )

    try {
      const pty = await this.getPty()

      if (!this.isReady) {
        this.logger.error("Service not ready")
        return {
          success: false,
          error: "Terminal service is not ready. Please try again.",
        }
      }

      const sessionId = this.generateSessionId()
      this.logger.info("Generated session ID:", sessionId)

      const shell = options.shell || this.defaultShell
      const cwd = options.cwd || os.homedir()
      const cols = options.cols || 80
      const rows = options.rows || 24

      this.logger.info("Session config:", { shell, cwd, cols, rows })

      if (!fs.existsSync(shell)) {
        this.logger.error("Shell does not exist:", shell)
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
        this.logger.warn("CWD does not exist, using home:", resolvedCwd)
        resolvedCwd = os.homedir()
      }

      const stats = fs.statSync(resolvedCwd)
      if (!stats.isDirectory()) {
        this.logger.warn("CWD is not a directory, using home:", resolvedCwd)
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
        this.logger.info("pty.spawn succeeded!")
      } catch (spawnError) {
        this.logger.error("pty.spawn failed:", spawnError)

        try {
          ptyProcess = pty.spawn("/bin/bash", [], {
            name: "xterm-256color",
            cols,
            rows,
            cwd: resolvedCwd,
            env,
          })
          this.logger.info("Fallback to /bin/bash succeeded!")
        } catch (fallbackError) {
          this.logger.error("Fallback also failed:", fallbackError)
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
      this.logger.info("Session stored:", sessionId)

      // Handle data from PTY
      ptyProcess.onData((data: string) => {
        const window = this.windowProvider.getWindow()
        window?.webContents.send("terminal:data", sessionId, data)
      })

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        this.logger.info(
          `Session ${sessionId} exited, code=${exitCode}, signal=${signal}`
        )
        const window = this.windowProvider.getWindow()
        window?.webContents.send("terminal:exit", sessionId, exitCode, signal)
        this.sessions.delete(sessionId)
      })

      this.logger.info(`Session ${sessionId} created successfully`)
      return { success: true, sessionId }
    } catch (error) {
      this.logger.error("Failed to create terminal session:", error)
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
      this.logger.warn("Write to unknown session:", sessionId)
      return { success: false, error: "Session not found" }
    }

    try {
      session.ptyProcess.write(data)
      return { success: true }
    } catch (error) {
      this.logger.error(`Failed to write to session ${sessionId}:`, error)
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
      this.logger.error(`Failed to resize session ${sessionId}:`, error)
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
      this.logger.info("Killed session:", sessionId)
      return { success: true }
    } catch (error) {
      this.logger.error(`Failed to kill session ${sessionId}:`, error)
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
    this.logger.info(`Cleaning up ${this.sessions.size} sessions`)
    for (const [sessionId, session] of this.sessions) {
      try {
        session.ptyProcess.kill()
        this.logger.info("Killed session:", sessionId)
      } catch (error) {
        this.logger.error(`Failed to kill session ${sessionId}:`, error)
      }
    }
    this.sessions.clear()
  }
}
