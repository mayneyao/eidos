import path from "node:path"
import { randomUUID } from "node:crypto"

import type { IPty, IPtyForkOptions } from "node-pty"

import {
  EIDOS_LITE_TERMINAL_SESSIONS_PER_WINDOW_MAX,
  type EidosLiteTerminalExit,
  type EidosLiteTerminalSession,
} from "../../shared/contracts"

const TERMINAL_INPUT_BYTES_MAX = 256 * 1024
const TERMINAL_DIMENSION_MAX = 1_000

export type TerminalPtySpawner = (
  file: string,
  args: string[] | string,
  options: IPtyForkOptions
) => IPty

interface ManagedTerminalSession {
  id: string
  ownerId: number
  pty: IPty
  disposeData(): void
  disposeExit(): void
  onExit(exit: EidosLiteTerminalExit): void
}

interface StartTerminalSessionOptions {
  ownerId: number
  cwd: string
  cols: number
  rows: number
  environment?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  shellExecutable?: string
  onData(sessionId: string, data: string): void
  onExit(exit: EidosLiteTerminalExit): void
}

function requiredTerminalDimension(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > TERMINAL_DIMENSION_MAX) {
    throw new Error(`Invalid terminal ${label}`)
  }
  return value
}

function requiredTerminalId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) {
    throw new Error("Invalid terminal session")
  }
  return value
}

function cleanTerminalEnvironment(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(environment)) {
    if (value !== undefined) clean[key] = value
  }
  delete clean.ELECTRON_RUN_AS_NODE
  delete clean.ELECTRON_NO_ASAR
  clean.TERM = "xterm-256color"
  clean.COLORTERM = "truecolor"
  clean.TERM_PROGRAM = "Eidos Lite"
  if (platform !== "win32" && !clean.LC_ALL && !clean.LC_CTYPE && !clean.LANG) {
    clean.LANG = platform === "darwin" ? "en_US.UTF-8" : "C.UTF-8"
  }
  return clean
}

function terminalShell(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  configuredExecutable?: string
): { executable: string; args: string[]; name: string } {
  const executable =
    configuredExecutable ??
    (platform === "win32"
      ? (environment.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")
      : (environment.SHELL ?? "/bin/sh"))
  const pathApi = platform === "win32" ? path.win32 : path.posix
  const executableName = pathApi.basename(executable).toLowerCase()
  const args =
    platform !== "win32"
      ? ["-l"]
      : executableName === "pwsh.exe" || executableName === "powershell.exe"
        ? ["-NoLogo"]
        : executableName === "bash.exe" ||
            executableName === "zsh.exe" ||
            executableName === "fish.exe" ||
            executableName === "nu.exe"
          ? ["-l"]
          : []
  return {
    executable,
    args,
    name: pathApi.basename(executable).replace(/\.exe$/iu, ""),
  }
}

export class TerminalSessionManager {
  private readonly sessions = new Map<string, ManagedTerminalSession>()

  constructor(private readonly spawnPty: TerminalPtySpawner) {}

  start(options: StartTerminalSessionOptions): EidosLiteTerminalSession {
    const cols = requiredTerminalDimension(options.cols, "columns")
    const rows = requiredTerminalDimension(options.rows, "rows")
    let ownerSessionCount = 0
    for (const session of this.sessions.values()) {
      if (session.ownerId === options.ownerId) ownerSessionCount += 1
    }
    if (ownerSessionCount >= EIDOS_LITE_TERMINAL_SESSIONS_PER_WINDOW_MAX) {
      throw new Error("Too many terminal sessions")
    }

    const environment = options.environment ?? process.env
    const platform = options.platform ?? process.platform
    const shell = terminalShell(environment, platform, options.shellExecutable)
    const id = randomUUID()
    const pty = this.spawnPty(shell.executable, shell.args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: options.cwd,
      env: cleanTerminalEnvironment(environment, platform),
    })
    const dataSubscription = pty.onData((data) => options.onData(id, data))
    let exitSubscription: { dispose(): void } | null = null
    const session: ManagedTerminalSession = {
      id,
      ownerId: options.ownerId,
      pty,
      disposeData: () => dataSubscription.dispose(),
      disposeExit: () => exitSubscription?.dispose(),
      onExit: options.onExit,
    }
    exitSubscription = pty.onExit(({ exitCode, signal }) => {
      if (this.sessions.get(id) !== session) return
      session.disposeData()
      session.disposeExit()
      this.sessions.delete(id)
      session.onExit({ sessionId: id, exitCode, signal })
    })
    this.sessions.set(id, session)
    return { id, shell: shell.name }
  }

  write(ownerId: number, sessionId: unknown, value: unknown): void {
    const session = this.requireOwned(ownerId, sessionId)
    if (typeof value !== "string") throw new Error("Invalid terminal input")
    if (Buffer.byteLength(value, "utf8") > TERMINAL_INPUT_BYTES_MAX) {
      throw new Error("Terminal input is too large")
    }
    session.pty.write(value)
  }

  resize(
    ownerId: number,
    sessionId: unknown,
    cols: number,
    rows: number
  ): void {
    const session = this.requireOwned(ownerId, sessionId)
    session.pty.resize(
      requiredTerminalDimension(cols, "columns"),
      requiredTerminalDimension(rows, "rows")
    )
  }

  closeSession(ownerId: number, sessionId: unknown): void {
    const session = this.requireOwned(ownerId, sessionId)
    this.disposeSession(session)
  }

  closeOwner(ownerId: number): void {
    for (const session of this.sessions.values()) {
      if (session.ownerId === ownerId) this.disposeSession(session)
    }
  }

  close(): void {
    for (const session of [...this.sessions.values()]) {
      this.disposeSession(session)
    }
  }

  private requireOwned(
    ownerId: number,
    sessionId: unknown
  ): ManagedTerminalSession {
    const id = requiredTerminalId(sessionId)
    const session = this.sessions.get(id)
    if (!session || session.ownerId !== ownerId) {
      throw new Error("Terminal session is unavailable")
    }
    return session
  }

  private disposeSession(session: ManagedTerminalSession): void {
    if (this.sessions.get(session.id) !== session) return
    this.sessions.delete(session.id)
    session.disposeData()
    session.disposeExit()
    try {
      session.pty.kill()
    } catch {
      // The shell may already have exited between lookup and cleanup.
    }
  }
}
