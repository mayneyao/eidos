// Terminal types for Eidos Desktop integration

export interface TerminalCreateOptions {
  cwd?: string
  shell?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export interface TerminalCreateResult {
  success: boolean
  sessionId?: string
  error?: string
}

export interface TerminalWriteResult {
  success: boolean
  error?: string
}

export interface TerminalResizeResult {
  success: boolean
  error?: string
}

export interface TerminalKillResult {
  success: boolean
  error?: string
}

export interface TerminalSessionInfo {
  id: string
  shell: string
  cwd: string
  createdAt: number
}

export interface TerminalGetHistoryResult {
  success: boolean
  history?: string[]
  error?: string
}

export interface TerminalAPI {
  create: (options?: TerminalCreateOptions) => Promise<TerminalCreateResult>
  write: (sessionId: string, data: string) => Promise<TerminalWriteResult>
  resize: (
    sessionId: string,
    cols: number,
    rows: number
  ) => Promise<TerminalResizeResult>
  kill: (sessionId: string) => Promise<TerminalKillResult>
  list: () => Promise<TerminalSessionInfo[]>
  getDefaultShell: () => Promise<string>
  getHistory: (sessionId: string) => Promise<TerminalGetHistoryResult>
  onData: (callback: (sessionId: string, data: string) => void) => () => void
  onExit: (
    callback: (sessionId: string, exitCode: number, signal?: number) => void
  ) => () => void
}
