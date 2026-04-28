import type { DataSpace } from "../data-space"

export interface AgentStep {
  id: string
  description: string
  status: "pending" | "in_progress" | "completed" | "failed"
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  error?: string
}

export interface AgentSession {
  id: string
  goal: string
  status: "planning" | "executing" | "completed" | "error" | "stopped"
  planSteps: AgentStep[]
  messages: Array<{
    id: string
    role: string
    content: string
    parts?: unknown[]
  }>
  model: string
  space: string
  createdAt: string
  completedAt?: string
  maxSteps: number
}

const SESSIONS_DIR = ".eidos/agent-sessions"

/**
 * File-based agent session storage, similar to Claude Code's conversation storage.
 * Each session is stored as a JSON file in the space's file system.
 */
export class AgentSessionStore {
  private space: DataSpace

  constructor(space: DataSpace) {
    this.space = space
  }

  private getSessionPath(sessionId: string): string {
    return `${SESSIONS_DIR}/${sessionId}.json`
  }

  /**
   * Save a session to a JSON file
   */
  async save(session: AgentSession): Promise<void> {
    const path = this.getSessionPath(session.id)
    const content = JSON.stringify(session, null, 2)
    await this.ensureDir()
    await this.writeFile(path, content)
  }

  /**
   * Load a session from a JSON file
   */
  async load(sessionId: string): Promise<AgentSession | null> {
    const path = this.getSessionPath(sessionId)
    try {
      const content = await this.readFile(path)
      return JSON.parse(content) as AgentSession
    } catch {
      return null
    }
  }

  /**
   * List all sessions, sorted by creation date (newest first)
   */
  async list(): Promise<AgentSession[]> {
    try {
      await this.ensureDir()
      const files = await this.listDir(SESSIONS_DIR)
      const sessions: AgentSession[] = []
      for (const file of files) {
        if (!file.endsWith(".json")) continue
        try {
          const content = await this.readFile(`${SESSIONS_DIR}/${file}`)
          sessions.push(JSON.parse(content) as AgentSession)
        } catch {
          // Skip corrupted files
        }
      }
      return sessions.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    } catch {
      return []
    }
  }

  /**
   * Delete a session file
   */
  async delete(sessionId: string): Promise<void> {
    const path = this.getSessionPath(sessionId)
    try {
      await this.deleteFile(path)
    } catch {
      // File may not exist
    }
  }

  private async ensureDir(): Promise<void> {
    try {
      await this.space.externalFS?.mkdir(SESSIONS_DIR)
    } catch {
      // Directory may already exist
    }
  }

  private async writeFile(path: string, content: string): Promise<void> {
    const encoder = new TextEncoder()
    await this.space.externalFS?.writeFile(path, encoder.encode(content))
  }

  private async readFile(path: string): Promise<string> {
    const data = await this.space.externalFS?.readFile(path)
    if (!data) return ""
    if (typeof data === "string") return data
    return new TextDecoder().decode(data as Uint8Array)
  }

  private async listDir(path: string): Promise<string[]> {
    const entries = await this.space.externalFS?.readdir(path)
    return entries?.map((e: any) => e.name ?? e) ?? []
  }

  private async deleteFile(path: string): Promise<void> {
    await this.space.externalFS?.unlink(path)
  }
}
