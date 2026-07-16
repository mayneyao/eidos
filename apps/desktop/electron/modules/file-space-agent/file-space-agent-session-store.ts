import { createHash } from "node:crypto"
import fs from "node:fs"
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import type {
  FileSpaceAgentConversation,
  FileSpaceAgentEvent,
  FileSpaceAgentEventBody,
} from "./types"

const CONVERSATION_ID = /^[a-zA-Z0-9_-]{1,128}$/

interface JournalState {
  events: FileSpaceAgentEvent[]
  latestSequence: number
  latestChecksum: string | null
}

function assertConversationId(conversationId: string): void {
  if (!CONVERSATION_ID.test(conversationId)) {
    throw new Error("Agent conversation ID is invalid")
  }
}

function eventChecksum(event: Omit<FileSpaceAgentEvent, "checksum">): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex")
}

function parseJournal(raw: string, repairFinalLine: boolean): JournalState {
  const lines = raw.split("\n")
  const events: FileSpaceAgentEvent[] = []
  let latestChecksum: string | null = null
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
    const { checksum, ...unsigned } = event
    if (
      event.sequence !== latestSequence + 1 ||
      event.previousChecksum !== latestChecksum ||
      checksum !== eventChecksum(unsigned)
    ) {
      throw new Error(
        `Agent conversation journal failed integrity validation at line ${index + 1}`
      )
    }
    events.push(event)
    latestSequence = event.sequence
    latestChecksum = checksum
  }

  return { events, latestSequence, latestChecksum }
}

export class FileSpaceAgentSessionStore {
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(private readonly rootPath: string) {}

  async ensureReady(): Promise<void> {
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
    await this.writeConversation(conversation)
    await this.append(conversation.id, {
      type: "conversation.created",
      data: { conversation },
    })
    return conversation
  }

  async loadConversation(
    conversationId: string
  ): Promise<FileSpaceAgentConversation | null> {
    assertConversationId(conversationId)
    try {
      const raw = await readFile(this.metaPath(conversationId), "utf8")
      return JSON.parse(raw) as FileSpaceAgentConversation
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
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

  async append(
    conversationId: string,
    body: FileSpaceAgentEventBody
  ): Promise<FileSpaceAgentEvent> {
    assertConversationId(conversationId)
    return this.enqueue(conversationId, async () => {
      await mkdir(this.conversationPath(conversationId), {
        recursive: true,
        mode: 0o700,
      })
      const journal = await this.readJournal(conversationId, true)
      const unsigned = {
        ...body,
        sequence: journal.latestSequence + 1,
        timestamp: new Date().toISOString(),
        previousChecksum: journal.latestChecksum,
      } as Omit<FileSpaceAgentEvent, "checksum">
      const event = {
        ...unsigned,
        checksum: eventChecksum(unsigned),
      } as FileSpaceAgentEvent
      const handle = await open(this.journalPath(conversationId), "a", 0o600)
      try {
        await handle.write(`${JSON.stringify(event)}\n`)
        await handle.sync()
      } finally {
        await handle.close()
      }

      const conversation = await this.loadConversation(conversationId)
      if (conversation) {
        await this.writeConversation({
          ...conversation,
          updatedAt: event.timestamp,
          latestSequence: event.sequence,
        })
      }
      return event
    })
  }

  async readEvents(
    conversationId: string,
    afterSequence = 0
  ): Promise<FileSpaceAgentEvent[]> {
    assertConversationId(conversationId)
    return this.enqueue(conversationId, async () => {
      const journal = await this.readJournal(conversationId, false)
      return journal.events.filter((event) => event.sequence > afterSequence)
    })
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
        return { events: [], latestSequence: 0, latestChecksum: null }
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
    await writeFile(temporary, JSON.stringify(conversation, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    })
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
