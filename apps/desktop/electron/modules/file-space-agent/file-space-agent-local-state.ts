import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import type { FileSpaceAgentApprovalMode } from "./types"

const LOCAL_STATE_FORMAT_VERSION = 1
const CONVERSATION_ID = /^[a-zA-Z0-9_-]{1,128}$/
const APPROVAL_MODES = new Set<FileSpaceAgentApprovalMode>([
  "ask",
  "auto-safe",
  "full-access",
])

interface AgentLocalState {
  formatVersion: number
  approvalModes: Record<string, FileSpaceAgentApprovalMode>
}

function emptyState(): AgentLocalState {
  return { formatVersion: LOCAL_STATE_FORMAT_VERSION, approvalModes: {} }
}

function assertConversationId(conversationId: string): void {
  if (!CONVERSATION_ID.test(conversationId)) {
    throw new Error("Agent conversation ID is invalid")
  }
}

function parseState(raw: string): AgentLocalState {
  try {
    const value = JSON.parse(raw) as Partial<AgentLocalState>
    if (
      value.formatVersion !== LOCAL_STATE_FORMAT_VERSION ||
      !value.approvalModes ||
      typeof value.approvalModes !== "object" ||
      Array.isArray(value.approvalModes)
    ) {
      return emptyState()
    }
    const approvalModes = Object.fromEntries(
      Object.entries(value.approvalModes).filter(
        (entry): entry is [string, FileSpaceAgentApprovalMode] =>
          CONVERSATION_ID.test(entry[0]) && APPROVAL_MODES.has(entry[1])
      )
    )
    return { formatVersion: LOCAL_STATE_FORMAT_VERSION, approvalModes }
  } catch {
    // Permission state fails closed. A corrupt local file can never grant more
    // authority than the default Ask policy.
    return emptyState()
  }
}

export class FileSpaceAgentLocalStateStore {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly rootPath: string) {}

  async getApprovalMode(
    conversationId: string
  ): Promise<FileSpaceAgentApprovalMode> {
    assertConversationId(conversationId)
    const state = await this.read()
    return state.approvalModes[conversationId] ?? "ask"
  }

  async setApprovalMode(
    conversationId: string,
    mode: FileSpaceAgentApprovalMode
  ): Promise<FileSpaceAgentApprovalMode> {
    assertConversationId(conversationId)
    if (!APPROVAL_MODES.has(mode)) {
      throw new Error("Agent approval mode is invalid")
    }
    return this.enqueue(async () => {
      const state = await this.read()
      state.approvalModes[conversationId] = mode
      await this.write(state)
      return mode
    })
  }

  async deleteConversation(conversationId: string): Promise<void> {
    assertConversationId(conversationId)
    await this.enqueue(async () => {
      const state = await this.read()
      if (!(conversationId in state.approvalModes)) return
      delete state.approvalModes[conversationId]
      await this.write(state)
    })
  }

  private async read(): Promise<AgentLocalState> {
    try {
      return parseState(await readFile(this.filePath(), "utf8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyState()
      }
      throw error
    }
  }

  private async write(state: AgentLocalState): Promise<void> {
    await mkdir(this.rootPath, { recursive: true, mode: 0o700 })
    const target = this.filePath()
    const temporary = `${target}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(state, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    })
    await rename(temporary, target)
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.queue.then(operation, operation)
    this.queue = current.then(
      () => undefined,
      () => undefined
    )
    return current
  }

  private filePath(): string {
    return path.join(this.rootPath, "preferences.json")
  }
}
