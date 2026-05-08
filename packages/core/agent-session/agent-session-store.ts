import type { UIMessage } from "ai"
import type { DataSpace } from "../data-space"

export interface AgentSession {
  id: string
  goal: string
  status: "planning" | "executing" | "completed" | "error" | "stopped"
  model: string
  space: string
  createdAt: string
  completedAt?: string
  maxSteps: number
}

type SessionMeta = AgentSession

const SESSIONS_DIR = "~/.eidos/agent/sessions"

// JSONL event types
interface UserEvent {
  type: "message"
  role: "user"
  id: string
  parts: UIMessage["parts"]
}

interface AssistantPartEvent {
  type: "message"
  role: "assistant"
  id: string
  messageId: string
  part: UIMessage["parts"][number]
}

type JsonlEvent = UserEvent | AssistantPartEvent

function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Clean a raw JSON line into readable snippet text for search results.
 */
function cleanSnippet(raw: string): string {
  let s = raw.replace(/^\s+/, "").replace(/\s+$/, "")
  if (s.endsWith(",")) s = s.slice(0, -1)
  if (s.startsWith('"') && s.endsWith('"') && !s.includes('":')) {
    s = s.slice(1, -1)
  }
  s = s.replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\\\/g, "\\")
  return s.length > 140 ? s.slice(0, 140) + "..." : s
}

/**
 * Serialize a single JSONL event line.
 */
function serializeEvent(event: JsonlEvent): string {
  return JSON.stringify(event)
}

/**
 * Serialize UIMessage[] into JSONL event lines (for full saves and migration).
 */
function* serializeMessages(messages: UIMessage[]): Generator<string> {
  for (const msg of messages) {
    if (msg.role === "user") {
      yield serializeEvent({
        type: "message",
        role: "user",
        id: msg.id || generateId(),
        parts: msg.parts,
      })
    } else if (msg.role === "assistant") {
      const messageId = msg.id || generateId()
      for (const part of msg.parts) {
        yield serializeEvent({
          type: "message",
          role: "assistant",
          id: generateId(),
          messageId,
          part,
        })
      }
    }
  }
}

/**
 * Reconstruct UIMessage[] from JSONL events.
 */
/**
 * Generate a dedup fingerprint for an assistant part.
 * Tool parts use toolCallId; text/reasoning use content; step-start uses type.
 */
function partFingerprint(part: UIMessage["parts"][number]): string {
  const p = part as any
  if (p.toolCallId) return `tool:${p.toolCallId}`
  if (p.type === "text") return `text:${p.text}`
  if (p.type === "reasoning") return `reasoning:${p.text}`
  return `${p.type}:${JSON.stringify(p)}`
}

function reconstructMessages(events: JsonlEvent[]): UIMessage[] {
  // Collect assistant parts by messageId, tracking insertion order
  const assistantParts = new Map<string, UIMessage["parts"]>()
  const assistantSeen = new Map<string, Set<string>>() // messageId → set of fingerprints
  const assistantOrder: string[] = []
  // Placeholder array — user messages inserted directly, assistant slots reserved
  const slots: Array<
    { type: "user"; msg: UIMessage } | { type: "assistant"; messageId: string }
  > = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.role === "user") {
      slots.push({
        type: "user",
        msg: { id: event.id, role: "user", parts: event.parts } as UIMessage,
      })
    } else if (event.role === "assistant") {
      if (!assistantParts.has(event.messageId)) {
        assistantOrder.push(event.messageId)
        assistantSeen.set(event.messageId, new Set())
        slots.push({ type: "assistant", messageId: event.messageId })
      }
      const fp = partFingerprint(event.part)
      const seenSet = assistantSeen.get(event.messageId)!
      if (!seenSet.has(fp)) {
        seenSet.add(fp)
        const existing = assistantParts.get(event.messageId) || []
        existing.push(event.part)
        assistantParts.set(event.messageId, existing)
      }
    }
  }

  // Build final message list preserving original order
  const seen = new Set<string>()
  const messages: UIMessage[] = []
  for (const slot of slots) {
    if (slot.type === "user") {
      messages.push(slot.msg)
    } else if (!seen.has(slot.messageId)) {
      seen.add(slot.messageId)
      messages.push({
        id: slot.messageId,
        role: "assistant",
        parts: assistantParts.get(slot.messageId)!,
      } as UIMessage)
    }
  }

  return messages
}

/**
 * File-based agent session storage using JSONL format.
 *
 * Each session consists of two files:
 * - {sessionId}.meta.json — session metadata (goal, model, status, timestamps)
 * - {sessionId}.jsonl — conversation events, one JSON object per line
 *
 * Assistant parts are stored one line each (streamed incrementally via onStepFinish).
 * User messages are stored as a single line with the full parts array.
 */
export class AgentSessionStore {
  private space: DataSpace

  constructor(space: DataSpace) {
    this.space = space
  }

  private getMetaPath(sessionId: string): string {
    return `${SESSIONS_DIR}/${sessionId}.meta.json`
  }

  private getJsonlPath(sessionId: string): string {
    return `${SESSIONS_DIR}/${sessionId}.jsonl`
  }

  // ── Save ──────────────────────────────────────────────

  /**
   * Write session metadata to .meta.json
   */
  async saveMeta(id: string, meta: SessionMeta): Promise<void> {
    await this.ensureDir()
    await this.writeFile(this.getMetaPath(id), JSON.stringify(meta, null, 2))
  }

  /**
   * Write full conversation as JSONL (used for migration and complete saves).
   * Overwrites any existing .jsonl file.
   */
  async saveMessages(id: string, messages: UIMessage[]): Promise<void> {
    await this.ensureDir()
    const lines = Array.from(serializeMessages(messages))
    await this.writeFile(this.getJsonlPath(id), lines.join("\n") + "\n")
  }

  /**
   * Append a user message as a single JSONL line.
   * Called before agent execution to ensure the user prompt is persisted.
   */
  async appendUserMessage(id: string, message: UIMessage): Promise<void> {
    await this.ensureDir()
    const line = serializeEvent({
      type: "message",
      role: "user",
      id: message.id || generateId(),
      parts: message.parts,
    })
    await this.appendLine(id, line)
  }

  /**
   * Append one step's responseMessage.parts to JSONL.
   * Each part becomes its own line. Called by onStepFinish.
   */
  async appendStepMessage(
    id: string,
    messageId: string,
    parts: UIMessage["parts"]
  ): Promise<void> {
    await this.ensureDir()
    for (const part of parts) {
      const line = serializeEvent({
        type: "message",
        role: "assistant",
        id: generateId(),
        messageId: messageId || generateId(),
        part,
      })
      await this.appendLine(id, line)
    }
  }

  /**
   * Append a raw line to the session's .jsonl file.
   */
  private async appendLine(sessionId: string, line: string): Promise<void> {
    const path = this.getJsonlPath(sessionId)
    await this.appendFile(path, line + "\n")
  }

  // ── Load ──────────────────────────────────────────────

  /**
   * Load a full session (metadata + reconstructed messages).
   */
  async load(
    sessionId: string
  ): Promise<(SessionMeta & { messages: UIMessage[] }) | null> {
    const meta = await this.loadMeta(sessionId)
    if (!meta) return null
    const messages = await this.loadMessages(sessionId)
    return { ...meta, messages }
  }

  /**
   * Load metadata from .meta.json
   */
  async loadMeta(sessionId: string): Promise<SessionMeta | null> {
    try {
      const content = await this.readFile(this.getMetaPath(sessionId))
      return content ? JSON.parse(content) : null
    } catch {
      return null
    }
  }

  /**
   * Load and reconstruct messages from .jsonl
   */
  async loadMessages(sessionId: string): Promise<UIMessage[]> {
    try {
      const content = await this.readFile(this.getJsonlPath(sessionId))
      if (!content) return []
      const lines = content.split("\n").filter((l) => l.trim())
      const events: JsonlEvent[] = lines.map((l) => JSON.parse(l))
      return reconstructMessages(events)
    } catch {
      return []
    }
  }

  /**
   * List all session metadata (reads *.meta.json files).
   */
  async listMeta(): Promise<SessionMeta[]> {
    await this.ensureDir()
    try {
      const files = await this.listDir(SESSIONS_DIR)
      const metaFiles = files.filter((f: string) => f.endsWith(".meta.json"))
      const metas: SessionMeta[] = []
      for (const file of metaFiles) {
        try {
          const content = await this.readFile(`${SESSIONS_DIR}/${file}`)
          if (content) metas.push(JSON.parse(content))
        } catch {
          // Skip corrupted files
        }
      }
      return metas.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    } catch {
      return []
    }
  }

  // ── Delete ────────────────────────────────────────────

  /**
   * Delete a session (.meta.json + .jsonl)
   */
  async delete(sessionId: string): Promise<void> {
    try {
      await this.deleteFile(this.getMetaPath(sessionId))
    } catch {}
    try {
      await this.deleteFile(this.getJsonlPath(sessionId))
    } catch {}
  }

  // ── Search ────────────────────────────────────────────

  /**
   * Search session contents using ripgrep on JSONL files.
   */
  async search(query: string): Promise<
    Array<{
      sessionId: string
      goal: string
      status: string
      createdAt: string
      completedAt?: string
      snippets: Array<{ lineNumber: number; content: string }>
    }>
  > {
    const raw = await this.space.externalFS?.searchContent(
      query,
      [SESSIONS_DIR],
      { filePattern: "*.jsonl", maxResults: 200 }
    )
    if (!raw?.length) return []

    // Group by file
    const byFile = new Map<
      string,
      Array<{ lineNumber: number; content: string }>
    >()
    for (const r of raw) {
      const arr = byFile.get(r.filePath) ?? []
      arr.push({ lineNumber: r.lineNumber, content: r.content })
      byFile.set(r.filePath, arr)
    }

    // Load metadata
    const metas = await this.listMeta()
    const metaMap = new Map(metas.map((m) => [m.id, m]))

    const results: Array<{
      sessionId: string
      goal: string
      status: string
      createdAt: string
      completedAt?: string
      snippets: Array<{ lineNumber: number; content: string }>
    }> = []

    for (const [filePath, matches] of byFile) {
      const name = filePath.split("/").pop()!
      const sessionId = name.replace(/\.jsonl$/, "")
      const meta = metaMap.get(sessionId)
      if (!meta) continue
      results.push({
        sessionId,
        goal: meta.goal,
        status: meta.status,
        createdAt: meta.createdAt,
        completedAt: meta.completedAt,
        snippets: matches.slice(0, 3).map((m) => ({
          lineNumber: m.lineNumber,
          content: cleanSnippet(m.content),
        })),
      })
    }

    results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    return results
  }

  // ── File system helpers ───────────────────────────────

  private async ensureDir(): Promise<void> {
    try {
      await this.space.externalFS?.mkdir(SESSIONS_DIR, { recursive: true })
    } catch {}
  }

  private async writeFile(path: string, content: string): Promise<void> {
    await this.space.externalFS?.writeFile(path, content)
  }

  private async appendFile(path: string, content: string): Promise<void> {
    await this.space.externalFS?.appendFile(path, content)
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
