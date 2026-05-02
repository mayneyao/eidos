import type { UIMessage } from "ai"
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
  messages: UIMessage[]
  model: string
  space: string
  createdAt: string
  completedAt?: string
  maxSteps: number
}

const SESSIONS_DIR = "~/.eidos/agent-sessions"
const INDEX_FILE = `${SESSIONS_DIR}/index.json`

type SessionMeta = Omit<AgentSession, "messages" | "planSteps">

/**
 * File-based agent session storage, similar to Claude Code's conversation storage.
 * Each session is stored as a JSON file in the space's file system.
 * A lightweight index.json maintains metadata for fast listing.
 */
export class AgentSessionStore {
  private space: DataSpace
  private indexPromise: Promise<void> | null = null

  constructor(space: DataSpace) {
    this.space = space
  }

  private getSessionPath(sessionId: string): string {
    return `${SESSIONS_DIR}/${sessionId}.json`
  }

  private extractMeta(session: AgentSession): SessionMeta {
    const { messages, planSteps, ...meta } = session
    return meta
  }

  /**
   * Serialize index to JSON (sorted newest-first)
   */
  private serializeIndex(index: SessionMeta[]): string {
    return JSON.stringify(
      index.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    )
  }

  /**
   * Update index.json with exclusive locking to prevent concurrent write races.
   * The updater receives the current index and returns the new index.
   */
  private async updateIndex(
    updater: (index: SessionMeta[]) => SessionMeta[]
  ): Promise<void> {
    // Chain onto a single promise to serialize concurrent calls
    const run = async () => {
      await this.ensureDir()
      let index: SessionMeta[] = []
      try {
        const content = await this.readFile(INDEX_FILE)
        if (content) index = JSON.parse(content)
      } catch {
        // Will rebuild below if needed
        index = await this.rebuildIndexFromFiles()
      }
      const newIndex = updater(index)
      await this.writeFile(INDEX_FILE, this.serializeIndex(newIndex))
    }

    // Chain: wait for previous update to finish before running this one
    this.indexPromise = (this.indexPromise ?? Promise.resolve()).then(run, run)
    return this.indexPromise
  }

  /**
   * Save a session to a JSON file and update the index
   */
  async save(session: AgentSession): Promise<void> {
    const path = this.getSessionPath(session.id)
    const content = JSON.stringify(session, null, 2)
    await this.ensureDir()
    await this.writeFile(path, content)
    await this.updateIndex((index) => {
      const meta = this.extractMeta(session)
      const i = index.findIndex((s) => s.id === session.id)
      if (i >= 0) index[i] = meta
      else index.push(meta)
      return index
    })
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
   * Rebuild index.json from all session files on disk (migration/fallback).
   */
  private async rebuildIndexFromFiles(): Promise<SessionMeta[]> {
    try {
      const files = await this.listDir(SESSIONS_DIR)
      const index: SessionMeta[] = []
      for (const file of files) {
        if (!file.endsWith(".json") || file === "index.json") continue
        try {
          const content = await this.readFile(`${SESSIONS_DIR}/${file}`)
          const session = JSON.parse(content) as AgentSession
          index.push(this.extractMeta(session))
        } catch {
          // Skip corrupted files
        }
      }
      return index.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    } catch {
      return []
    }
  }

  /**
   * List session metadata only (without messages and planSteps).
   * Reads from the lightweight index.json for O(1) file I/O.
   * Falls back to rebuilding from files if index is missing.
   */
  async listMeta(): Promise<SessionMeta[]> {
    await this.ensureDir()
    try {
      const content = await this.readFile(INDEX_FILE)
      if (content) return JSON.parse(content) as SessionMeta[]
    } catch {
      // Index missing or corrupt — rebuild
    }
    const index = await this.rebuildIndexFromFiles()
    await this.writeFile(INDEX_FILE, this.serializeIndex(index))
    return index
  }

  /**
   * Delete a session file and remove it from the index
   */
  async delete(sessionId: string): Promise<void> {
    const path = this.getSessionPath(sessionId)
    try {
      await this.deleteFile(path)
    } catch {
      // File may not exist
    }
    await this.updateIndex((index) => index.filter((s) => s.id !== sessionId))
  }

  private async ensureDir(): Promise<void> {
    try {
      await this.space.externalFS?.mkdir(SESSIONS_DIR, { recursive: true })
    } catch {
      // Directory may already exist
    }
  }

  private async writeFile(path: string, content: string): Promise<void> {
    await this.space.externalFS?.writeFile(path, content)
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
