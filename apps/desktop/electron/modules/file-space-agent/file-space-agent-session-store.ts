import fs from "node:fs"
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import path from "node:path"

import type {
  FileSpaceAgentConversation,
  FileSpaceAgentEvent,
  FileSpaceAgentEventBody,
} from "./types"
import {
  FILE_SPACE_AGENT_EVENT_SCHEMA_VERSION,
  FILE_SPACE_AGENT_FORMAT_VERSION,
} from "./types"

const CONVERSATION_ID = /^[a-zA-Z0-9_-]{1,128}$/

interface JournalState {
  events: FileSpaceAgentEvent[]
  latestSequence: number
}

interface CachedJournalState extends JournalState {
  size: number
  mtimeMs: number
}

function assertConversationId(conversationId: string): void {
  if (!CONVERSATION_ID.test(conversationId)) {
    throw new Error("Agent conversation ID is invalid")
  }
}

const DURABLE_EVENT_TYPES = new Set<FileSpaceAgentEventBody["type"]>([
  "conversation.created",
  "message.created",
  "message.snapshot",
  "conversation.truncated",
  "resource.context",
  "run.status",
  "tool.status",
])

function assertDurableEventType(type: FileSpaceAgentEventBody["type"]): void {
  if (DURABLE_EVENT_TYPES.has(type)) return
  throw new Error(
    `Agent event ${type} is transient runtime data and cannot be persisted`
  )
}

function parseJournal(raw: string, repairFinalLine: boolean): JournalState {
  const lines = raw.split("\n")
  const events: FileSpaceAgentEvent[] = []
  let latestSequence = 0

  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue
    let event: FileSpaceAgentEvent
    try {
      event = JSON.parse(line) as FileSpaceAgentEvent
    } catch (error) {
      const isFinalLine = index === lines.length - 1
      if (repairFinalLine && isFinalLine) break
      throw new Error(
        `Agent conversation journal is corrupt at line ${index + 1}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
    if (event.schemaVersion !== FILE_SPACE_AGENT_EVENT_SCHEMA_VERSION) {
      throw new Error(
        `Agent conversation journal uses unsupported event schema version ${event.schemaVersion}`
      )
    }
    assertDurableEventType(event.type)
    if (event.sequence !== latestSequence + 1) {
      throw new Error(
        `Agent conversation journal has an invalid sequence at line ${index + 1}`
      )
    }
    events.push(event)
    latestSequence = event.sequence
  }

  return { events, latestSequence }
}

export class FileSpaceAgentSessionStore {
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly journalCache = new Map<string, CachedJournalState>()
  private readyPromise: Promise<void> | null = null

  constructor(private readonly rootPath: string) {}

  async ensureReady(): Promise<void> {
    this.readyPromise ??= this.prepareRoot()
    await this.readyPromise
  }

  private async prepareRoot(): Promise<void> {
    await mkdir(this.rootPath, { recursive: true, mode: 0o700 })
  }

  async createConversation(
    conversation: FileSpaceAgentConversation
  ): Promise<FileSpaceAgentConversation> {
    assertConversationId(conversation.id)
    await this.ensureReady()
    const existing = await this.loadConversation(conversation.id)
    if (existing) return existing
    await mkdir(this.conversationPath(conversation.id), {
      recursive: true,
      mode: 0o700,
    })
    const portable = {
      ...conversation,
      formatVersion: FILE_SPACE_AGENT_FORMAT_VERSION,
      spaceId: undefined,
      approvalMode: undefined,
    }
    await this.writeConversation(portable)
    await this.append(portable.id, {
      type: "conversation.created",
      data: { conversation: portable },
    })
    return portable
  }

  async loadConversation(
    conversationId: string
  ): Promise<FileSpaceAgentConversation | null> {
    assertConversationId(conversationId)
    try {
      const raw = await readFile(this.metaPath(conversationId), "utf8")
      const conversation = JSON.parse(raw) as FileSpaceAgentConversation
      if (
        conversation.formatVersion !== undefined &&
        conversation.formatVersion !== FILE_SPACE_AGENT_FORMAT_VERSION
      ) {
        throw new Error(
          `Agent conversation uses unsupported format version ${conversation.formatVersion}`
        )
      }
      const {
        spaceId: _legacySpaceId,
        approvalMode: _legacyApprovalMode,
        ...portable
      } = conversation
      return {
        ...portable,
        formatVersion: FILE_SPACE_AGENT_FORMAT_VERSION,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  }

  async updateConversation(
    conversationId: string,
    updates: Partial<
      Pick<
        FileSpaceAgentConversation,
        | "title"
        | "model"
        | "thinking"
        | "skills"
        | "parentId"
        | "forkedMessageId"
      >
    >
  ): Promise<FileSpaceAgentConversation> {
    assertConversationId(conversationId)
    return this.enqueue(conversationId, async () => {
      const conversation = await this.loadConversation(conversationId)
      if (!conversation) throw new Error("Agent conversation was not found")
      const updated = {
        ...conversation,
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      await this.writeConversation(updated)
      return updated
    })
  }

  async listConversations(): Promise<FileSpaceAgentConversation[]> {
    await this.ensureReady()
    const entries = await fs.promises.readdir(this.rootPath, {
      withFileTypes: true,
    })
    const conversations = await Promise.all(
      entries
        .filter(
          (entry) => entry.isDirectory() && CONVERSATION_ID.test(entry.name)
        )
        .map((entry) => this.loadConversation(entry.name))
    )
    return conversations
      .filter((item): item is FileSpaceAgentConversation => item !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async deleteConversation(conversationId: string): Promise<void> {
    assertConversationId(conversationId)
    await this.ensureReady()
    await this.enqueue(conversationId, async () => {
      await rm(this.conversationPath(conversationId), {
        recursive: true,
        force: true,
      })
      this.journalCache.delete(conversationId)
    })
  }

  async append(
    conversationId: string,
    body: FileSpaceAgentEventBody
  ): Promise<FileSpaceAgentEvent> {
    assertConversationId(conversationId)
    assertDurableEventType(body.type)
    return this.enqueue(conversationId, async () => {
      await mkdir(this.conversationPath(conversationId), {
        recursive: true,
        mode: 0o700,
      })
      const journal = await this.getJournal(conversationId, true)
      const event = {
        ...body,
        schemaVersion: FILE_SPACE_AGENT_EVENT_SCHEMA_VERSION,
        sequence: journal.latestSequence + 1,
        timestamp: new Date().toISOString(),
      } as FileSpaceAgentEvent
      const handle = await open(this.journalPath(conversationId), "a", 0o600)
      try {
        await handle.write(`${JSON.stringify(event)}\n`)
        await handle.sync()
      } finally {
        await handle.close()
      }

      const journalStats = await stat(this.journalPath(conversationId))
      this.journalCache.set(conversationId, {
        events: [...journal.events, event],
        latestSequence: event.sequence,
        size: journalStats.size,
        mtimeMs: journalStats.mtimeMs,
      })
      return event
    })
  }

  async readEvents(
    conversationId: string,
    afterSequence = 0
  ): Promise<FileSpaceAgentEvent[]> {
    assertConversationId(conversationId)
    return this.enqueue(conversationId, async () => {
      const journal = await this.getJournal(conversationId, false)
      return journal.events.slice(afterSequence)
    })
  }

  private async getJournal(
    conversationId: string,
    repairFinalLine: boolean
  ): Promise<CachedJournalState> {
    let journalStats: Awaited<ReturnType<typeof stat>> | null = null
    try {
      journalStats = await stat(this.journalPath(conversationId))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    const cached = this.journalCache.get(conversationId)
    if (
      cached &&
      journalStats &&
      cached.size === journalStats.size &&
      cached.mtimeMs === journalStats.mtimeMs
    ) {
      return cached
    }
    if (!journalStats) {
      const empty = {
        events: [],
        latestSequence: 0,
        size: 0,
        mtimeMs: 0,
      }
      this.journalCache.set(conversationId, empty)
      return empty
    }
    const state = await this.readJournal(conversationId, repairFinalLine)
    const refreshedStats = await stat(this.journalPath(conversationId))
    const refreshed = {
      ...state,
      size: refreshedStats.size,
      mtimeMs: refreshedStats.mtimeMs,
    }
    this.journalCache.set(conversationId, refreshed)
    return refreshed
  }

  private async readJournal(
    conversationId: string,
    repairFinalLine: boolean
  ): Promise<JournalState> {
    let raw: string
    try {
      raw = await readFile(this.journalPath(conversationId), "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { events: [], latestSequence: 0 }
      }
      throw error
    }
    const state = parseJournal(raw, repairFinalLine)
    if (repairFinalLine) {
      const canonical = state.events
        .map((event) => JSON.stringify(event))
        .join("\n")
      const expected = canonical ? `${canonical}\n` : ""
      if (raw !== expected) {
        await writeFile(this.journalPath(conversationId), expected, {
          encoding: "utf8",
          mode: 0o600,
        })
      }
    }
    return state
  }

  private async writeConversation(
    conversation: FileSpaceAgentConversation
  ): Promise<void> {
    const target = this.metaPath(conversation.id)
    const temporary = `${target}.${process.pid}.tmp`
    const {
      spaceId: _localSpaceId,
      approvalMode: _localApprovalMode,
      latestRunStatus: _latestRunStatus,
      pendingApprovalCount: _pendingApprovalCount,
      pendingApprovalTitle: _pendingApprovalTitle,
      ...portable
    } = conversation
    await writeFile(
      temporary,
      JSON.stringify(
        { ...portable, formatVersion: FILE_SPACE_AGENT_FORMAT_VERSION },
        null,
        2
      ),
      {
        encoding: "utf8",
        mode: 0o600,
      }
    )
    await rename(temporary, target)
  }

  private enqueue<T>(
    conversationId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.queues.get(conversationId) ?? Promise.resolve()
    const current = previous.then(operation, operation)
    const tracked = current.finally(() => {
      if (this.queues.get(conversationId) === tracked) {
        this.queues.delete(conversationId)
      }
    })
    this.queues.set(conversationId, tracked)
    return current
  }

  private conversationPath(conversationId: string): string {
    assertConversationId(conversationId)
    return path.join(this.rootPath, conversationId)
  }

  private journalPath(conversationId: string): string {
    return path.join(this.conversationPath(conversationId), "events.jsonl")
  }

  private metaPath(conversationId: string): string {
    return path.join(this.conversationPath(conversationId), "meta.json")
  }
}
