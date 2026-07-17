import { AsyncLocalStorage } from "node:async_hooks"
import { createHash, randomUUID } from "node:crypto"
import path from "node:path"

import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { z } from "zod"

import { fetchWeb, searchWeb } from "@/packages/ai/tools/web-tools"

import { IpcInjectable, Inject } from "../../common/di"
import { ConfigManager } from "../config/config-manager"
import { FileExtensionService } from "../file-extensions/file-extension.service"
import { SpaceManagementService } from "../space-management/space-management.service"
import { SpaceResourceLifecycle } from "../space-management/space-resource-lifecycle"
import { SpaceRegistry } from "../space-management/space-registry"
import { FileSpaceAgentLocalStateStore } from "./file-space-agent-local-state"
import { SpaceVersioningService } from "../space-versioning/space-versioning.service"
import { buildFileSpaceAgentMessages } from "./file-space-agent-messages"
import { prepareFileSpaceAgentRuntime } from "./file-space-agent-runtime"
import { FileSpaceAgentRuntimeStateStore } from "./file-space-agent-runtime-state"
import { FileSpaceAgentSessionStore } from "./file-space-agent-session-store"
import type {
  FileSpaceAgentApprovalMode,
  FileSpaceAgentApprovalDecision,
  FileSpaceAgentConversation,
  FileSpaceAgentConversationSnapshot,
  FileSpaceAgentEvent,
  FileSpaceAgentMention,
  FileSpaceAgentMessage,
  FileSpaceAgentMessagePart,
  FileSpaceAgentResourceContext,
  FileSpaceAgentRun,
  FileSpaceAgentThinkingLevel,
  FileSpaceAgentToolRun,
  StartFileSpaceAgentRunInput,
  StartFileSpaceAgentRunResult,
} from "./types"
import { FILE_SPACE_AGENT_FORMAT_VERSION } from "./types"

const MAX_PROMPT_CHARS = 32_000
const MAX_CONTEXT_CHARS = 24_000
const MAX_SELECTION_CHARS = 8_000
const MAX_TOOL_RESULT_CHARS = 48_000
const MAX_PATCH_CHARS = 256_000
const MAX_BINARY_CONTEXT_BYTES = 10 * 1024 * 1024
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1_000
const MAX_CONCURRENT_RUNS_PER_SPACE = 4
const EXTENSION_SOURCE_ROOT = ".eidos/extensions"
const AGENT_PRIVATE_ROOT = ".eidos/agent"
const AGENT_SESSIONS_ROOT = ".eidos/agent/sessions"
const POTENTIALLY_UNSAFE_TOOL_NAMES = new Set<FileSpaceAgentToolRun["name"]>([
  "space.files.delete",
  "extension.uninstall",
  "extension.trust",
  "extension.enable",
  "extension.grant",
  "extension.command",
  "version.discard",
  "version.restorePath",
  "version.restore",
  "version.configureRemote",
  "version.removeRemote",
  "version.fetch",
  "version.pull",
  "version.push",
  "version.resolveConflict",
])
const TERMINAL_RUN_STATES = new Set<FileSpaceAgentRun["status"]>([
  "succeeded",
  "failed",
  "canceled",
  "interrupted",
])
const TERMINAL_TOOL_STATES = new Set<FileSpaceAgentToolRun["status"]>([
  "succeeded",
  "failed",
  "denied",
  "canceled",
  "interrupted",
  "outcome-unknown",
])

interface ActiveRun {
  spaceId: string
  store: FileSpaceAgentSessionStore
  run: FileSpaceAgentRun
  message: FileSpaceAgentMessage
  runtimeState: FileSpaceAgentRuntimeStateStore
  approvalMode: FileSpaceAgentApprovalMode
  thinking: FileSpaceAgentThinkingLevel
  skills: string[]
  mentions: FileSpaceAgentMention[]
  abortController: AbortController
  completion?: Promise<void>
}

interface PendingApproval {
  spaceId: string
  conversationId: string
  runId: string
  tool: FileSpaceAgentToolRun
  resolve: (decision: FileSpaceAgentApprovalDecision) => void
  timeout: NodeJS.Timeout
}

function now(): string {
  return new Date().toISOString()
}

function appendLiveMessageDelta(
  message: FileSpaceAgentMessage,
  type: "text" | "reasoning",
  text: string
): void {
  const last = message.parts.at(-1)
  if (last?.type === type && typeof last.text === "string") {
    last.text += text
    return
  }
  message.parts.push({ type, text })
}

function replaceLiveMessagePart(
  message: FileSpaceAgentMessage,
  part: FileSpaceAgentMessagePart
): void {
  const toolCallId =
    typeof part.toolCallId === "string" ? part.toolCallId : undefined
  if (!toolCallId) {
    message.parts.push(part)
    return
  }
  const existing = message.parts.findIndex(
    (candidate) => candidate.toolCallId === toolCallId
  )
  if (existing === -1) {
    message.parts.push(part)
    return
  }
  message.parts[existing] = { ...message.parts[existing], ...part }
}

function withLiveMessage(
  messages: FileSpaceAgentMessage[],
  liveMessage: FileSpaceAgentMessage | undefined
): FileSpaceAgentMessage[] {
  if (!liveMessage || liveMessage.parts.length === 0) return messages
  const next = messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => ({ ...part })),
    metadata: message.metadata ? { ...message.metadata } : undefined,
  }))
  const existing = next.findIndex((message) => message.id === liveMessage.id)
  const cloned = {
    ...liveMessage,
    parts: liveMessage.parts.map((part) => ({ ...part })),
    metadata: liveMessage.metadata ? { ...liveMessage.metadata } : undefined,
  }
  if (existing === -1) next.push(cloned)
  else next[existing] = cloned
  return next
}

function compact(value: unknown, maxChars = MAX_TOOL_RESULT_CHARS): string {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value, null, 2)
  const text = serialized ?? String(value)
  return text.length <= maxChars
    ? text
    : `${text.slice(0, maxChars)}\n… truncated by Eidos Agent …`
}

function titleFromPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim()
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77)}…`
}

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}

function imageMediaType(relativePath: string): string | undefined {
  return IMAGE_MEDIA_TYPES[path.extname(relativePath).toLowerCase()]
}

function contextTarget(sourceUrl: string | undefined): {
  path: string
  heading?: string
  tableId?: string
  rowId?: string
} | null {
  if (!sourceUrl) return null
  try {
    const url = new URL(sourceUrl, "https://eidos.local")
    if (url.pathname !== "/space-file" || !url.hash) return null
    return {
      path: decodeURIComponent(url.hash.slice(1)),
      heading: url.searchParams.get("heading") || undefined,
      tableId: url.searchParams.get("table") || undefined,
      rowId: url.searchParams.get("record") || undefined,
    }
  } catch {
    return null
  }
}

function diffPreview(pathname: string, before: string, after: string): string {
  const oldLines = before.split("\n")
  const newLines = after.split("\n")
  let prefix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const removed = oldLines.slice(prefix, oldLines.length - suffix)
  const added = newLines.slice(prefix, newLines.length - suffix)
  const body = [
    `--- a/${pathname}`,
    `+++ b/${pathname}`,
    `@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`,
    ...removed.slice(0, 120).map((line) => `-${line}`),
    ...added.slice(0, 120).map((line) => `+${line}`),
  ]
  if (removed.length > 120 || added.length > 120) {
    body.push("… diff truncated by Eidos Agent …")
  }
  return body.join("\n")
}

function isExtensionPackageRoot(relativePath: string): boolean {
  const normalized = relativePath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "")
  const prefix = `${EXTENSION_SOURCE_ROOT}/`
  return (
    normalized.startsWith(prefix) &&
    normalized.slice(prefix.length).length > 0 &&
    !normalized.slice(prefix.length).includes("/")
  )
}

function normalizedPortablePath(relativePath: string): string {
  const normalized = path.posix.normalize(
    relativePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "")
  )
  return normalized === "." ? "" : normalized
}

function isAgentPrivatePath(relativePath: string): boolean {
  const normalized = normalizedPortablePath(relativePath)
  return (
    normalized === AGENT_PRIVATE_ROOT ||
    normalized.startsWith(`${AGENT_PRIVATE_ROOT}/`)
  )
}

function isAgentSessionPath(relativePath: string): boolean {
  const normalized = normalizedPortablePath(relativePath)
  return (
    normalized === AGENT_SESSIONS_ROOT ||
    normalized.startsWith(`${AGENT_SESSIONS_ROOT}/`)
  )
}

function assertAgentReadablePath(relativePath: string): void {
  if (!isAgentPrivatePath(relativePath)) return
  throw new Error(
    "Agent conversation and local policy files are private runtime data and cannot be read by Agent Space tools"
  )
}

function assertGenericFileMutationPath(relativePath: string): void {
  if (isAgentPrivatePath(relativePath)) {
    throw new Error(
      "Agent conversation and local policy files cannot be modified by Agent Space tools"
    )
  }
  if (!isExtensionPackageRoot(relativePath)) return
  throw new Error(
    "Use create_extension or uninstall_extension for an Extension package root; generic Space file tools may only edit files inside an existing package"
  )
}

function shouldRequestToolApproval(
  mode: FileSpaceAgentApprovalMode,
  tool: Pick<FileSpaceAgentToolRun, "name" | "risk">
): boolean {
  if (mode === "ask") return true
  if (mode === "full-access") return false
  return (
    tool.risk === "external" || POTENTIALLY_UNSAFE_TOOL_NAMES.has(tool.name)
  )
}

@IpcInjectable("file-space-agent")
export class FileSpaceAgentService extends IpcServiceBase {
  private readonly toolCallContext = new AsyncLocalStorage<string>()
  private readonly stores = new Map<string, FileSpaceAgentSessionStore>()
  private readonly localStates = new Map<
    string,
    FileSpaceAgentLocalStateStore
  >()
  private readonly runtimeStates = new Map<
    string,
    FileSpaceAgentRuntimeStateStore
  >()
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly startingConversations = new Set<string>()
  private readonly pendingApprovals = new Map<string, PendingApproval>()
  private readonly recoveredConversations = new Set<string>()

  constructor(
    @Inject(SpaceRegistry) private readonly registry: SpaceRegistry,
    @Inject(SpaceManagementService)
    private readonly spaces: SpaceManagementService,
    @Inject(ConfigManager) private readonly config: ConfigManager,
    @Inject(FileExtensionService)
    private readonly extensions: FileExtensionService | undefined = undefined,
    @Inject(SpaceVersioningService)
    private readonly versioning: SpaceVersioningService | undefined = undefined,
    @Inject(SpaceResourceLifecycle)
    resourceLifecycle: SpaceResourceLifecycle | undefined = undefined
  ) {
    super()
    resourceLifecycle?.register(
      "file-space-agent",
      (spacePath) => this.releaseSpace(spacePath),
      () => this.releaseAllSpaces()
    )
  }

  async getApprovalMode(
    spaceId: string,
    conversationId: string
  ): Promise<FileSpaceAgentApprovalMode> {
    this.getStore(spaceId)
    return this.getLocalState(spaceId).getApprovalMode(conversationId)
  }

  async setApprovalMode(
    spaceId: string,
    conversationId: string,
    mode: FileSpaceAgentApprovalMode
  ): Promise<FileSpaceAgentApprovalMode> {
    this.getStore(spaceId)
    return this.getLocalState(spaceId).setApprovalMode(conversationId, mode)
  }

  async listConversations(
    spaceId: string
  ): Promise<FileSpaceAgentConversation[]> {
    const store = this.getStore(spaceId)
    const conversations = await store.listConversations()
    await Promise.all(
      conversations.map((conversation) =>
        this.recoverConversation(spaceId, store, conversation.id)
      )
    )
    const refreshed = await store.listConversations()
    return Promise.all(
      refreshed.map(async (conversation) => {
        const active = [...this.activeRuns.values()].find(
          (item) =>
            item.spaceId === spaceId &&
            item.run.conversationId === conversation.id
        )
        const events = await store.readEvents(conversation.id)
        const latestRun = [...events]
          .reverse()
          .find((event) => event.type === "run.status")
        const approvals = [...this.pendingApprovals.values()].filter(
          (approval) =>
            approval.spaceId === spaceId &&
            approval.conversationId === conversation.id
        )
        return {
          ...conversation,
          spaceId,
          latestRunStatus:
            active?.run.status ??
            (latestRun?.type === "run.status"
              ? latestRun.data.run.status
              : undefined),
          pendingApprovalCount: approvals.length || undefined,
          pendingApprovalTitle: approvals[0]?.tool.title,
        }
      })
    )
  }

  async getConversation(
    spaceId: string,
    conversationId: string,
    afterSequence = 0
  ): Promise<FileSpaceAgentConversationSnapshot> {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
      throw new Error("Agent event sequence must be a non-negative integer")
    }
    const store = this.getStore(spaceId)
    await this.recoverConversation(spaceId, store, conversationId)
    const conversation = await store.loadConversation(conversationId)
    const activeRun = [...this.activeRuns.values()].find(
      (item) =>
        item.spaceId === spaceId && item.run.conversationId === conversationId
    )
    const allEvents = conversation ? await store.readEvents(conversationId) : []
    const events = allEvents.slice(afterSequence)
    const approvalMode =
      await this.getLocalState(spaceId).getApprovalMode(conversationId)
    return {
      conversation: conversation ? { ...conversation, spaceId } : null,
      events,
      messages: conversation
        ? withLiveMessage(
            buildFileSpaceAgentMessages(allEvents),
            activeRun?.message
          )
        : [],
      activeRun: activeRun?.run ?? null,
      approvalMode,
    }
  }

  async searchConversations(
    spaceId: string,
    query: string
  ): Promise<FileSpaceAgentConversation[]> {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return this.listConversations(spaceId)
    const store = this.getStore(spaceId)
    const conversations = await this.listConversations(spaceId)
    const matches = await Promise.all(
      conversations.map(async (conversation) => {
        if (conversation.title.toLocaleLowerCase().includes(normalized)) {
          return conversation
        }
        const messages = buildFileSpaceAgentMessages(
          await store.readEvents(conversation.id)
        )
        const content = messages
          .flatMap((message) => message.parts)
          .map((part) => {
            if (typeof part.text === "string") return part.text
            if (typeof part.output === "string") return part.output
            if (typeof part.errorText === "string") return part.errorText
            return ""
          })
          .join("\n")
          .toLocaleLowerCase()
        return content.includes(normalized) ? conversation : null
      })
    )
    return matches.filter(
      (conversation): conversation is FileSpaceAgentConversation =>
        conversation !== null
    )
  }

  async deleteConversation(
    spaceId: string,
    conversationId: string
  ): Promise<boolean> {
    const active = [...this.activeRuns.values()].some(
      (item) =>
        item.spaceId === spaceId && item.run.conversationId === conversationId
    )
    if (active) throw new Error("Stop the active Agent run before deleting")
    const store = this.getStore(spaceId)
    await store.deleteConversation(conversationId)
    await this.getLocalState(spaceId).deleteConversation(conversationId)
    this.getRuntimeState(spaceId).deleteConversation(conversationId)
    this.recoveredConversations.delete(`${spaceId}:${conversationId}`)
    return true
  }

  async forkConversation(
    spaceId: string,
    sourceConversationId: string,
    targetMessageId: string,
    newConversationId: string
  ): Promise<FileSpaceAgentConversation> {
    const active = [...this.activeRuns.values()].some(
      (item) =>
        item.spaceId === spaceId &&
        item.run.conversationId === sourceConversationId
    )
    if (active) throw new Error("Stop the active Agent run before forking")
    const store = this.getStore(spaceId)
    const source = await store.loadConversation(sourceConversationId)
    if (!source) throw new Error("Agent conversation was not found")
    const sourceEvents = await store.readEvents(sourceConversationId)
    const messages = buildFileSpaceAgentMessages(sourceEvents)
    const targetIndex = messages.findIndex(
      (message) => message.id === targetMessageId
    )
    if (targetIndex === -1) {
      throw new Error("Agent message was not found")
    }
    if (await store.loadConversation(newConversationId)) {
      throw new Error("Agent fork conversation already exists")
    }
    const timestamp = now()
    const fork = await store.createConversation({
      formatVersion: FILE_SPACE_AGENT_FORMAT_VERSION,
      id: newConversationId,
      title: source.title,
      model: source.model,
      thinking: source.thinking,
      skills: source.skills,
      parentId: sourceConversationId,
      forkedMessageId: targetMessageId,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    for (const message of messages.slice(0, targetIndex + 1)) {
      await store.append(newConversationId, {
        type: "message.snapshot",
        data: { message },
      })
    }
    const includedMessageIds = new Set(
      messages.slice(0, targetIndex + 1).map((message) => message.id)
    )
    const includedRunIds = new Set<string>()
    for (const event of sourceEvents) {
      if (
        event.type === "message.created" &&
        includedMessageIds.has(event.data.id)
      ) {
        includedRunIds.add(event.data.runId)
      } else if (
        event.type === "message.snapshot" &&
        event.data.runId &&
        includedMessageIds.has(event.data.message.id)
      ) {
        includedRunIds.add(event.data.runId)
      }
    }
    const latestTools = new Map<string, FileSpaceAgentToolRun>()
    const latestRuns = new Map<string, FileSpaceAgentRun>()
    for (const event of sourceEvents) {
      if (
        event.type === "resource.context" &&
        includedRunIds.has(event.data.runId)
      ) {
        await store.append(newConversationId, {
          type: "resource.context",
          data: event.data,
        })
      } else if (
        event.type === "tool.status" &&
        includedRunIds.has(event.data.tool.runId)
      ) {
        latestTools.set(event.data.tool.id, event.data.tool)
      } else if (
        event.type === "run.status" &&
        includedRunIds.has(event.data.run.id)
      ) {
        latestRuns.set(event.data.run.id, event.data.run)
      }
    }
    for (const tool of latestTools.values()) {
      await store.append(newConversationId, {
        type: "tool.status",
        data: { tool },
      })
    }
    for (const run of latestRuns.values()) {
      await store.append(newConversationId, {
        type: "run.status",
        data: { run },
      })
    }
    return {
      ...((await store.loadConversation(newConversationId)) ?? fork),
      spaceId,
    }
  }

  async replaceMessage(
    spaceId: string,
    conversationId: string,
    targetMessageId: string,
    content: string,
    model: string
  ): Promise<boolean> {
    const active = [...this.activeRuns.values()].some(
      (item) =>
        item.spaceId === spaceId && item.run.conversationId === conversationId
    )
    if (active) throw new Error("Stop the active Agent run before editing")
    const text = content.trim()
    if (!text || text.length > MAX_PROMPT_CHARS) {
      throw new Error(
        `Agent prompt must contain 1-${MAX_PROMPT_CHARS} characters`
      )
    }
    const store = this.getStore(spaceId)
    const messages = buildFileSpaceAgentMessages(
      await store.readEvents(conversationId)
    )
    const targetIndex = messages.findIndex(
      (message) => message.id === targetMessageId && message.role === "user"
    )
    if (targetIndex === -1) throw new Error("Agent user message was not found")
    await store.append(conversationId, {
      type: "conversation.truncated",
      data: {
        targetMessageId,
        replacement: {
          id: targetMessageId,
          role: "user",
          parts: [{ type: "text", text }],
          metadata: { createdAt: Date.now(), model },
        },
      },
    })
    if (targetIndex === 0) {
      await store.updateConversation(conversationId, {
        title: titleFromPrompt(text),
      })
    }
    return true
  }

  async startRun(
    input: StartFileSpaceAgentRunInput
  ): Promise<StartFileSpaceAgentRunResult> {
    if (!input || typeof input !== "object") {
      throw new Error("Agent run input is invalid")
    }
    if (typeof input.spaceId !== "string" || input.spaceId.length > 256) {
      throw new Error("Agent Space ID is invalid")
    }
    if (typeof input.conversationId !== "string") {
      throw new Error("Agent conversation ID is invalid")
    }
    if (typeof input.prompt !== "string") {
      throw new Error("Agent prompt is invalid")
    }
    if (
      input.context !== undefined &&
      (typeof input.context !== "object" ||
        (input.context.sourceUrl !== undefined &&
          (typeof input.context.sourceUrl !== "string" ||
            input.context.sourceUrl.length > 4_096)) ||
        (input.context.selection !== undefined &&
          typeof input.context.selection !== "string"))
    ) {
      throw new Error("Agent resource context is invalid")
    }
    let prompt = input.prompt.trim()
    if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
      throw new Error(
        `Agent prompt must contain 1-${MAX_PROMPT_CHARS} characters`
      )
    }
    if (
      typeof input.model !== "string" ||
      !input.model ||
      input.model.length > 512
    ) {
      throw new Error("Agent model reference is invalid")
    }
    if (
      input.regenerateFromMessageId !== undefined &&
      (typeof input.regenerateFromMessageId !== "string" ||
        !input.regenerateFromMessageId ||
        input.regenerateFromMessageId.length > 256)
    ) {
      throw new Error("Agent regeneration message is invalid")
    }
    const thinking = input.thinking ?? "off"
    if (!["off", "low", "medium", "high"].includes(thinking)) {
      throw new Error("Agent thinking level is invalid")
    }
    const skills = input.skills ?? []
    if (
      !Array.isArray(skills) ||
      skills.length > 32 ||
      skills.some(
        (skill) => typeof skill !== "string" || !skill || skill.length > 128
      )
    ) {
      throw new Error("Agent skills are invalid")
    }
    const mentions = input.mentions ?? []
    if (
      !Array.isArray(mentions) ||
      mentions.length > 64 ||
      mentions.some(
        (mention) =>
          !mention ||
          typeof mention !== "object" ||
          typeof mention.id !== "string" ||
          typeof mention.name !== "string" ||
          typeof mention.type !== "string" ||
          mention.id.length > 512 ||
          mention.name.length > 512 ||
          mention.type.length > 128
      )
    ) {
      throw new Error("Agent mentions are invalid")
    }
    const store = this.getStore(input.spaceId)
    await this.recoverConversation(input.spaceId, store, input.conversationId)
    const approvalMode = await this.getLocalState(
      input.spaceId
    ).getApprovalMode(input.conversationId)
    const conversationKey = `${input.spaceId}\0${input.conversationId}`
    const alreadyActive = [...this.activeRuns.values()].some(
      (item) =>
        item.spaceId === input.spaceId &&
        item.run.conversationId === input.conversationId
    )
    if (alreadyActive || this.startingConversations.has(conversationKey)) {
      throw new Error("This Agent conversation already has an active run")
    }
    const activeSpaceRuns = [...this.activeRuns.values()].filter(
      (item) => item.spaceId === input.spaceId
    ).length
    const startingSpaceRuns = [...this.startingConversations].filter((key) =>
      key.startsWith(`${input.spaceId}\0`)
    ).length
    if (activeSpaceRuns + startingSpaceRuns >= MAX_CONCURRENT_RUNS_PER_SPACE) {
      throw new Error(
        `This Space already has ${MAX_CONCURRENT_RUNS_PER_SPACE} active Agent runs`
      )
    }
    this.startingConversations.add(conversationKey)

    try {
      const timestamp = now()
      const existing = await store.loadConversation(input.conversationId)
      const conversation = await store.createConversation(
        existing ?? {
          formatVersion: FILE_SPACE_AGENT_FORMAT_VERSION,
          id: input.conversationId,
          title: titleFromPrompt(prompt),
          model: input.model,
          thinking,
          skills,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
      )
      const updatedConversation = await store.updateConversation(
        input.conversationId,
        {
          model: input.model,
          thinking,
          skills,
        }
      )

      const runId = randomUUID()
      const messageId = randomUUID()
      const run: FileSpaceAgentRun = {
        id: runId,
        conversationId: input.conversationId,
        messageId,
        status: "queued",
        model: input.model,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const context = await this.resolveResourceContext(
        input.spaceId,
        input.context
      )
      let appendUserMessage = true
      if (input.regenerateFromMessageId) {
        const messages = buildFileSpaceAgentMessages(
          await store.readEvents(input.conversationId)
        )
        const targetIndex = messages.findIndex(
          (message) => message.id === input.regenerateFromMessageId
        )
        if (targetIndex === -1) {
          throw new Error("Agent regeneration message was not found")
        }
        const target = messages[targetIndex]
        if (target.role === "assistant") {
          await store.append(input.conversationId, {
            type: "conversation.truncated",
            data: { targetMessageId: target.id },
          })
          const previousUser = [...messages.slice(0, targetIndex)]
            .reverse()
            .find((message) => message.role === "user")
          const text = previousUser?.parts.find(
            (part) => part.type === "text" && typeof part.text === "string"
          )?.text
          if (typeof text !== "string" || !text.trim()) {
            throw new Error("Agent regeneration requires a user message")
          }
          prompt = text.trim()
        } else {
          if (targetIndex !== messages.length - 1) {
            await store.append(input.conversationId, {
              type: "conversation.truncated",
              data: { targetMessageId: target.id, replacement: target },
            })
          }
          const text = target.parts.find(
            (part) => part.type === "text" && typeof part.text === "string"
          )?.text
          if (typeof text !== "string" || !text.trim()) {
            throw new Error("Agent regeneration requires a text message")
          }
          prompt = text.trim()
        }
        appendUserMessage = false
      }
      if (appendUserMessage) {
        await store.append(input.conversationId, {
          type: "message.created",
          data: {
            id: randomUUID(),
            role: "user",
            text: prompt,
            runId,
            metadata: {
              createdAt: Date.now(),
              model: input.model,
            },
          },
        })
      }
      if (context) {
        await store.append(input.conversationId, {
          type: "resource.context",
          data: { runId, context },
        })
      }
      await store.append(input.conversationId, {
        type: "run.status",
        data: { run },
      })
      const active: ActiveRun = {
        spaceId: input.spaceId,
        store,
        run,
        message: {
          id: messageId,
          role: "assistant",
          parts: [],
        },
        runtimeState: this.getRuntimeState(input.spaceId),
        approvalMode,
        thinking,
        skills,
        mentions,
        abortController: new AbortController(),
      }
      this.activeRuns.set(runId, active)
      active.runtimeState.save({ run: active.run, message: active.message })
      active.completion = this.executeRun(active, context).catch((error) => {
        console.error("[file-space-agent] background run failed", error)
      })
      return {
        run,
        conversation: { ...updatedConversation, spaceId: input.spaceId },
      }
    } finally {
      this.startingConversations.delete(conversationKey)
    }
  }

  async stopRun(
    spaceId: string,
    conversationId: string,
    runId: string
  ): Promise<boolean> {
    const active = this.activeRuns.get(runId)
    if (
      !active ||
      active.spaceId !== spaceId ||
      active.run.conversationId !== conversationId
    ) {
      return false
    }
    active.abortController.abort()
    for (const [toolId, approval] of this.pendingApprovals) {
      if (approval.runId === runId) {
        clearTimeout(approval.timeout)
        this.pendingApprovals.delete(toolId)
        approval.resolve("deny")
        await this.appendTool(active, {
          ...approval.tool,
          status: "canceled",
          updatedAt: now(),
        })
      }
    }
    return true
  }

  decideToolRun(
    spaceId: string,
    conversationId: string,
    runId: string,
    toolRunId: string,
    decision: FileSpaceAgentApprovalDecision
  ): boolean {
    const approval = this.pendingApprovals.get(toolRunId)
    if (
      !approval ||
      approval.spaceId !== spaceId ||
      approval.conversationId !== conversationId ||
      approval.runId !== runId ||
      (decision !== "allow-once" && decision !== "deny")
    ) {
      return false
    }
    clearTimeout(approval.timeout)
    this.pendingApprovals.delete(toolRunId)
    approval.resolve(decision)
    return true
  }

  private async executeRun(
    active: ActiveRun,
    context: FileSpaceAgentResourceContext | null
  ): Promise<void> {
    const { run, store, abortController } = active
    const startedAt = Date.now()
    let assistantPersisted = false
    let terminalPersisted = false
    try {
      await this.setRunStatus(active, "running")
      const aiConfig = this.config.get("ai")
      const [requestedModel, providerName, unexpected] = run.model.split("@")
      const providerConfig = aiConfig.llmProviders.find(
        (candidate) =>
          candidate.name === providerName && candidate.enabled !== false
      )
      if (
        !requestedModel ||
        !providerName ||
        unexpected !== undefined ||
        !providerConfig
      ) {
        throw new Error("The selected Agent provider is unavailable")
      }
      const tools = await this.createTools(active)
      const conversation = await store.loadConversation(run.conversationId)
      const messages = buildFileSpaceAgentMessages(
        await store.readEvents(run.conversationId)
      )
      await this.attachBinaryContext(active, context, messages)
      const prepared = await prepareFileSpaceAgentRuntime({
        goal: conversation?.title ?? "Work in this file-based Space",
        messages,
        instructions: this.buildInstructions(active.approvalMode, context),
        model: run.model,
        tools,
        thinking: active.thinking,
        skills: active.skills,
        mentions: active.mentions,
        aiConfig,
      })
      const result = await prepared.agent.stream({
        messages: prepared.modelMessages as any,
        abortSignal: abortController.signal,
      })
      let runtimeTimer: NodeJS.Timeout | undefined
      let runtimeError: unknown
      const flushRuntime = () => {
        try {
          active.runtimeState.save({
            run: active.run,
            message: active.message,
          })
        } catch (error) {
          runtimeError = error
        }
      }
      const scheduleRuntimeFlush = () => {
        if (runtimeTimer) return
        runtimeTimer = setTimeout(() => {
          runtimeTimer = undefined
          flushRuntime()
        }, 75)
      }
      const drainRuntime = () => {
        if (runtimeTimer) {
          clearTimeout(runtimeTimer)
          runtimeTimer = undefined
        }
        flushRuntime()
        if (runtimeError) throw runtimeError
      }
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta" && part.text) {
            appendLiveMessageDelta(active.message, "text", part.text)
            scheduleRuntimeFlush()
          } else if (part.type === "reasoning-delta" && part.text) {
            appendLiveMessageDelta(active.message, "reasoning", part.text)
            scheduleRuntimeFlush()
          } else if (part.type === "tool-call") {
            drainRuntime()
            replaceLiveMessagePart(active.message, {
              type: `tool-${part.toolName}`,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              state: "input-available",
              input: part.input,
              args: part.input,
            })
            flushRuntime()
          } else if (part.type === "tool-result") {
            drainRuntime()
            replaceLiveMessagePart(active.message, {
              type: `tool-${part.toolName}`,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              state: "output-available",
              input: part.input,
              args: part.input,
              output: part.output,
            })
            flushRuntime()
          } else if (part.type === "error") {
            drainRuntime()
            throw part.error
          } else if (part.type === "tool-error") {
            drainRuntime()
            replaceLiveMessagePart(active.message, {
              type: `tool-${part.toolName}`,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              state: "output-error",
              input: part.input,
              args: part.input,
              errorText:
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error),
            })
            flushRuntime()
            throw part.error
          }
        }
      } finally {
        drainRuntime()
      }
      if (abortController.signal.aborted) {
        throw new Error("Agent run was canceled")
      }
      const usage = await result.usage
      active.message.metadata = {
        createdAt: startedAt,
        model: run.model,
        duration: Date.now() - startedAt,
        tokens: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        },
      }
      active.runtimeState.save({ run: active.run, message: active.message })
      await store.append(run.conversationId, {
        type: "message.snapshot",
        data: { message: active.message, runId: run.id },
      })
      assistantPersisted = true
      await this.setRunStatus(active, "succeeded")
      terminalPersisted = true
    } catch (error) {
      const canceled = abortController.signal.aborted
      if (!canceled) {
        console.error("[file-space-agent] run failed", {
          runId: run.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      if (!assistantPersisted && active.message.parts.length > 0) {
        active.message.metadata ??= {
          createdAt: startedAt,
          model: run.model,
          duration: Date.now() - startedAt,
        }
        await store.append(run.conversationId, {
          type: "message.snapshot",
          data: { message: active.message, runId: run.id },
        })
        assistantPersisted = true
      }
      await this.setRunStatus(active, canceled ? "canceled" : "failed", {
        error: canceled
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
      })
      terminalPersisted = true
    } finally {
      if (terminalPersisted) active.runtimeState.deleteRun(run.id)
      this.activeRuns.delete(run.id)
    }
  }

  private async createTools(active: ActiveRun): Promise<Record<string, any>> {
    const nativeTools = {
      web_search: {
        description:
          "Search the public web with Exa. Returns bounded titles, URLs, and snippets. Use web_fetch on selected results when the answer depends on the source body, and preserve source URLs in the final answer.",
        inputSchema: z.object({
          query: z.string().min(1).max(500),
          limit: z.number().int().min(1).max(10).default(5),
        }),
        execute: async ({ query, limit }: { query: string; limit: number }) => {
          const apiKey = this.config.get("ai").exaApiKey?.trim()
          if (!apiKey) {
            return {
              error:
                "Web search requires an Exa API key. Configure it in Settings → AI → Tool API Keys, then retry.",
            }
          }
          return this.runControlledTool(
            active,
            {
              name: "web.search",
              title: "Search the web",
              risk: "external",
              resource: "https://api.exa.ai",
            },
            `query=${JSON.stringify(query)}, limit=${limit}`,
            `Search the public web for ${JSON.stringify(query)}`,
            () =>
              searchWeb(query, {
                apiKey,
                numResults: limit,
                signal: active.abortController.signal,
              })
          )
        },
      },
      web_fetch: {
        description:
          "Fetch one public HTTP or HTTPS URL. HTML is reduced to readable Markdown; JSON is pretty-printed; text formats are returned directly. Local and private network addresses are blocked. Preserve the fetched URL when citing the source.",
        inputSchema: z.object({
          url: z.string().url().max(4_096),
        }),
        execute: async ({ url }: { url: string }) =>
          this.runControlledTool(
            active,
            {
              name: "web.fetch",
              title: "Fetch web page",
              risk: "external",
              resource: url,
            },
            `url=${JSON.stringify(url)}`,
            `Fetch and read ${url}`,
            () => fetchWeb(url, { signal: active.abortController.signal })
          ),
      },
      list_space_files: {
        description:
          "List one directory in the current file-based Space, including the public .eidos/extensions source tree. Agent session and local policy files are excluded.",
        inputSchema: z.object({
          directory: z.string().max(1_024).default(""),
          includeHidden: z.boolean().default(false),
        }),
        execute: async ({
          directory,
          includeHidden,
        }: {
          directory: string
          includeHidden: boolean
        }) => {
          assertAgentReadablePath(directory)
          return this.runObserveTool(
            active,
            "space.files.list",
            "List Space directory",
            `directory=${JSON.stringify(directory)}`,
            directory || undefined,
            async () => {
              const entries = await this.spaces.listFiles(
                active.spaceId,
                directory,
                {
                  includeHidden,
                }
              )
              return compact(
                entries.filter((entry) => !isAgentPrivatePath(entry.path))
              )
            }
          )
        },
      },
      search_space_files: {
        description:
          "Search public files in the current Eidos Space. Use this before reading files that may answer the user's question.",
        inputSchema: z.object({
          query: z.string().min(1).max(500),
          limit: z.number().int().min(1).max(20).default(8),
        }),
        execute: async ({ query, limit }: { query: string; limit: number }) =>
          this.runObserveTool(
            active,
            "space.files.search",
            "Search Space files",
            `query=${JSON.stringify(query)}, limit=${limit}`,
            undefined,
            async () => {
              const results = await this.spaces.searchFiles(
                active.spaceId,
                query,
                {
                  limit,
                  includeContent: true,
                }
              )
              return compact(
                results.filter((result) => !isAgentPrivatePath(result.path))
              )
            }
          ),
      },
      read_space_file: {
        description:
          "Read a public UTF-8 text file from the current Eidos Space. The result includes the digest required by write_space_file.",
        inputSchema: z.object({ path: z.string().min(1).max(1_024) }),
        execute: async ({ path: relativePath }: { path: string }) => {
          assertAgentReadablePath(relativePath)
          return this.runObserveTool(
            active,
            "space.files.readText",
            "Read Space file",
            `path=${JSON.stringify(relativePath)}`,
            relativePath,
            async () => {
              const file = await this.spaces.readFile(
                active.spaceId,
                relativePath,
                MAX_TOOL_RESULT_CHARS
              )
              return compact(file)
            }
          )
        },
      },
      create_space_file: {
        description:
          "Create a new UTF-8 text file in the current Space. This also supports extension source below .eidos/extensions. Eidos applies the conversation approval mode before creating it.",
        inputSchema: z.object({
          path: z.string().min(1).max(1_024),
          content: z.string().max(MAX_PATCH_CHARS).default(""),
          summary: z.string().min(1).max(500),
        }),
        execute: async (input: {
          path: string
          content: string
          summary: string
        }) => {
          assertGenericFileMutationPath(input.path)
          return this.runControlledTool(
            active,
            {
              name: "space.files.createText",
              title: "Create Space file",
              risk: "modify",
              resource: input.path,
            },
            input.summary,
            diffPreview(input.path, "", input.content),
            async () =>
              compact(
                await this.spaces.createFile(
                  active.spaceId,
                  input.path,
                  input.content
                )
              )
          )
        },
      },
      create_space_directory: {
        description:
          "Create a directory in the current Space. Eidos applies the conversation approval mode before creating it.",
        inputSchema: z.object({
          path: z.string().min(1).max(1_024),
          summary: z.string().min(1).max(500),
        }),
        execute: async (input: { path: string; summary: string }) => {
          assertGenericFileMutationPath(input.path)
          return this.runControlledTool(
            active,
            {
              name: "space.files.createDirectory",
              title: "Create Space directory",
              risk: "modify",
              resource: input.path,
            },
            input.summary,
            `Create directory ${input.path}`,
            async () =>
              compact(
                await this.spaces.createDirectory(active.spaceId, input.path)
              )
          )
        },
      },
      write_space_file: {
        description:
          "Replace an existing UTF-8 text file in the current Space. First call read_space_file and pass its exact contentDigest. Eidos records a diff and applies the conversation approval mode before writing.",
        inputSchema: z.object({
          path: z.string().min(1).max(1_024),
          expectedContentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          content: z.string().max(MAX_PATCH_CHARS),
          summary: z.string().min(1).max(500),
        }),
        execute: async (input: {
          path: string
          expectedContentDigest: string
          content: string
          summary: string
        }) => this.runWriteFileTool(active, input),
      },
      move_space_path: {
        description:
          "Move or rename a public file or directory in the current Space. Eidos applies the conversation approval mode before moving it.",
        inputSchema: z.object({
          sourcePath: z.string().min(1).max(1_024),
          destinationPath: z.string().min(1).max(1_024),
          summary: z.string().min(1).max(500),
        }),
        execute: async (input: {
          sourcePath: string
          destinationPath: string
          summary: string
        }) => {
          assertGenericFileMutationPath(input.sourcePath)
          assertGenericFileMutationPath(input.destinationPath)
          const fingerprint = await this.capturePathFingerprint(
            active.spaceId,
            input.sourcePath
          )
          return this.runControlledTool(
            active,
            {
              name: "space.files.move",
              title: "Move Space path",
              risk: "modify",
              resource: input.sourcePath,
            },
            input.summary,
            `${input.sourcePath} → ${input.destinationPath}\n${fingerprint.preview}`,
            async () => {
              await this.assertPathFingerprintUnchanged(
                active.spaceId,
                input.sourcePath,
                fingerprint.digest
              )
              return compact(
                await this.spaces.moveFile(
                  active.spaceId,
                  input.sourcePath,
                  input.destinationPath
                )
              )
            }
          )
        },
      },
      delete_space_path: {
        description:
          "Delete a public file or directory from the current Space. Directories are removed recursively. This is destructive and remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          path: z.string().min(1).max(1_024),
          summary: z.string().min(1).max(500),
        }),
        execute: async (input: { path: string; summary: string }) => {
          assertGenericFileMutationPath(input.path)
          const fingerprint = await this.capturePathFingerprint(
            active.spaceId,
            input.path
          )
          return this.runControlledTool(
            active,
            {
              name: "space.files.delete",
              title: "Delete Space path",
              risk: "modify",
              resource: input.path,
            },
            input.summary,
            `Delete ${input.path}\n${fingerprint.preview}`,
            async () => {
              await this.assertPathFingerprintUnchanged(
                active.spaceId,
                input.path,
                fingerprint.digest
              )
              return compact(
                await this.spaces.removeFile(active.spaceId, input.path)
              )
            }
          )
        },
      },
      inspect_base: {
        description:
          "Inspect tables, fields, views, and row counts in a .base file in the current Eidos Space.",
        inputSchema: z.object({ path: z.string().min(1).max(1_024) }),
        execute: async ({ path: relativePath }: { path: string }) =>
          this.runObserveTool(
            active,
            "space.base.inspect",
            "Inspect Base",
            `path=${JSON.stringify(relativePath)}`,
            relativePath,
            async () =>
              compact(
                await this.spaces.getBaseSnapshotReadOnly(
                  active.spaceId,
                  relativePath
                )
              )
          ),
      },
      read_base_rows: {
        description:
          "Read a bounded page of rows from a table in a .base file in the current Eidos Space.",
        inputSchema: z.object({
          path: z.string().min(1).max(1_024),
          tableId: z.string().min(1).max(255),
          offset: z.number().int().min(0).default(0),
          limit: z.number().int().min(1).max(100).default(20),
          search: z.string().max(500).optional(),
        }),
        execute: async ({
          path: relativePath,
          tableId,
          offset,
          limit,
          search,
        }: {
          path: string
          tableId: string
          offset: number
          limit: number
          search?: string
        }) =>
          this.runObserveTool(
            active,
            "space.base.readRows",
            "Read Base rows",
            `path=${JSON.stringify(relativePath)}, table=${JSON.stringify(tableId)}, offset=${offset}, limit=${limit}`,
            `${relativePath}#${tableId}`,
            async () =>
              compact(
                await this.spaces.getBaseTablePage(
                  active.spaceId,
                  relativePath,
                  tableId,
                  {
                    offset,
                    limit,
                    query: search ? { search } : {},
                  }
                )
              )
          ),
      },
    }
    const extensionTools = await this.createExtensionTools(active)
    const versionTools = this.createVersionTools(active)

    return this.bindToolCallContext({
      ...nativeTools,
      ...extensionTools,
      ...versionTools,
    })
  }

  private bindToolCallContext(tools: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(tools).map(([name, definition]) => {
        const execute = definition?.execute
        if (typeof execute !== "function") return [name, definition]
        return [
          name,
          {
            ...definition,
            execute: (input: unknown, options?: { toolCallId?: string }) => {
              if (!options?.toolCallId) return execute(input, options)
              return this.toolCallContext.run(options.toolCallId, () =>
                execute(input, options)
              )
            },
          },
        ]
      })
    )
  }

  private async createExtensionTools(
    active: ActiveRun
  ): Promise<Record<string, any>> {
    if (!this.extensions) return {}
    let commands: Awaited<ReturnType<FileExtensionService["listCommands"]>> = []
    try {
      commands = await this.extensions.listCommands(active.spaceId)
    } catch {}
    const commandList = commands
      .map(
        (command) =>
          `- ${command.id}: ${command.title} (${command.extensionDisplayName})`
      )
      .join("\n")
    const tools: Record<string, any> = {
      inspect_extensions: {
        description:
          "List file-based Extension packages, or validate one selected package. Passing packageId runs the complete manifest, TypeScript SDK, and compiler validation; sourceValidation.ok must be true before trust or enable.",
        inputSchema: z.object({ packageId: z.string().max(256).optional() }),
        execute: async ({ packageId }: { packageId?: string }) =>
          this.runObserveTool(
            active,
            "extension.inspect",
            "Inspect Extensions",
            packageId ? `package=${packageId}` : "all packages",
            packageId ? `.eidos/extensions/${packageId}` : ".eidos/extensions",
            async () => {
              const discovery = await this.extensions!.discover(active.spaceId)
              const packages = packageId
                ? discovery.packages.filter(
                    (extension) =>
                      extension.canonicalId === packageId ||
                      extension.directoryName === packageId
                  )
                : discovery.packages
              const sourceValidations = packageId
                ? new Map(
                    await Promise.all(
                      packages.map(
                        async (extension) =>
                          [
                            extension.directoryName,
                            await this.extensions!.validatePackage(
                              active.spaceId,
                              extension.directoryName
                            ),
                          ] as const
                      )
                    )
                  )
                : undefined
              return compact({
                ...discovery,
                packages: packages.map((extension) => ({
                  ...extension,
                  ...(sourceValidations
                    ? {
                        sourceValidation: sourceValidations.get(
                          extension.directoryName
                        ),
                      }
                    : {}),
                })),
                ...(!packageId
                  ? {
                      validationHint:
                        "Pass packageId to run TypeScript SDK and compiler validation before trust or enable.",
                    }
                  : {}),
              })
            }
          ),
      },
      create_extension: {
        description:
          "Create a canonical file-based Extension template under .eidos/extensions. Edit its returned files with read_space_file and write_space_file, then call inspect_extensions.",
        inputSchema: z.object({
          name: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
          template: z.enum(["command", "panel", "text-editor", "base-view"]),
          filenamePattern: z.string().max(512).optional(),
          mediaType: z.string().max(256).optional(),
        }),
        execute: async (input: {
          name: string
          template: "command" | "panel" | "text-editor" | "base-view"
          filenamePattern?: string
          mediaType?: string
        }) =>
          this.runControlledTool(
            active,
            {
              name: "extension.create",
              title: "Create Extension",
              risk: "modify",
              resource: `.eidos/extensions/local.${input.name}`,
            },
            `Create ${input.template} Extension local.${input.name}`,
            compact(input, 4_000),
            async () => this.extensions!.createTemplate(active.spaceId, input)
          ),
      },
      uninstall_extension: {
        description:
          "Uninstall an exact inspected file-based Extension package and clean up its runtime state. Pass the directoryName, canonicalId, and contentDigest returned by inspect_extensions. This remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          directoryName: z.string().min(1).max(256),
          canonicalId: z.string().min(1).max(256),
          contentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        }),
        execute: async (input: {
          directoryName: string
          canonicalId: string
          contentDigest: string
        }) =>
          this.runControlledTool(
            active,
            {
              name: "extension.uninstall",
              title: "Uninstall Extension",
              risk: "modify",
              resource: `${EXTENSION_SOURCE_ROOT}/${input.directoryName}`,
            },
            `Uninstall exact snapshot ${input.canonicalId}`,
            compact(input, 4_000),
            async () => this.extensions!.uninstall(active.spaceId, input)
          ),
      },
      trust_extension: {
        description:
          "Trust the exact inspected Extension source snapshot. Pass the packageId, contentDigest, and permissionHash returned by inspect_extensions. This remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          packageId: z.string().min(1).max(256),
          contentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          permissionHash: z.string().min(1).max(256),
        }),
        execute: async (input: {
          packageId: string
          contentDigest: string
          permissionHash: string
        }) =>
          this.runControlledTool(
            active,
            {
              name: "extension.trust",
              title: "Trust Extension snapshot",
              risk: "modify",
              resource: `.eidos/extensions/${input.packageId}`,
            },
            `Trust exact snapshot ${input.packageId}`,
            compact(input, 4_000),
            async () => {
              await this.assertExtensionSourceValid(
                active.spaceId,
                input.packageId
              )
              return this.extensions!.trust(active.spaceId, input)
            }
          ),
      },
      set_extension_enabled: {
        description:
          "Enable or disable an exact trusted Extension snapshot. This remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          packageId: z.string().min(1).max(256),
          contentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          permissionHash: z.string().min(1).max(256),
          enabled: z.boolean(),
        }),
        execute: async (input: {
          packageId: string
          contentDigest: string
          permissionHash: string
          enabled: boolean
        }) =>
          this.runControlledTool(
            active,
            {
              name: "extension.enable",
              title: input.enabled ? "Enable Extension" : "Disable Extension",
              risk: "modify",
              resource: `.eidos/extensions/${input.packageId}`,
            },
            `${input.enabled ? "Enable" : "Disable"} ${input.packageId}`,
            compact(input, 4_000),
            async () => {
              if (input.enabled) {
                await this.assertExtensionSourceValid(
                  active.spaceId,
                  input.packageId
                )
              }
              return this.extensions!.setEnabled(
                active.spaceId,
                input,
                input.enabled
              )
            }
          ),
      },
      set_extension_grant: {
        description:
          "Grant or revoke one exact files.read, files.write, or network permission for an Extension snapshot. This remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          packageId: z.string().min(1).max(256),
          contentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          permissionHash: z.string().min(1).max(256),
          kind: z.enum(["files.read", "files.write", "network"]),
          value: z.string().min(1).max(2_048),
          granted: z.boolean(),
        }),
        execute: async (input: {
          packageId: string
          contentDigest: string
          permissionHash: string
          kind: "files.read" | "files.write" | "network"
          value: string
          granted: boolean
        }) =>
          this.runControlledTool(
            active,
            {
              name: "extension.grant",
              title: input.granted
                ? "Grant Extension permission"
                : "Revoke Extension permission",
              risk: "modify",
              resource: `.eidos/extensions/${input.packageId}`,
            },
            `${input.granted ? "Grant" : "Revoke"} ${input.kind} ${input.value}`,
            compact(input, 4_000),
            async () =>
              this.extensions!.setGrant(active.spaceId, {
                packageId: input.packageId,
                contentDigest: input.contentDigest,
                permissionHash: input.permissionHash,
                grant: { kind: input.kind, value: input.value },
                granted: input.granted,
              })
          ),
      },
    }
    tools.run_extension_command = {
      description: `Run an enabled file-based Extension command against one public Space resource. Commands are refreshed immediately before execution, so a command created or enabled earlier in this run is available. Eidos validates the exact snapshot and keeps execution approval-gated unless the user selected Full access.${commandList ? `\n\nCommands available at run start:\n${commandList}` : ""}`,
      inputSchema: z.object({
        commandId: z.string().min(1).max(256),
        path: z.string().min(1).max(4_096),
      }),
      execute: async (input: { commandId: string; path: string }) => {
        const currentCommands = await this.extensions!.listCommands(
          active.spaceId
        )
        const command = currentCommands.find(
          (candidate) => candidate.id === input.commandId
        )
        if (!command) {
          return { error: "The requested Extension command is unavailable." }
        }
        return this.runControlledTool(
          active,
          {
            name: "extension.command",
            title: "Run Extension command",
            risk: "modify",
            resource: input.path,
          },
          `${command.title} on ${input.path}`,
          compact(input, 4_000),
          async () =>
            this.extensions!.executeCommand(active.spaceId, {
              packageId: command.packageId,
              contentDigest: command.contentDigest,
              permissionHash: command.permissionHash,
              commandId: command.id,
              resource: { path: input.path },
            })
        )
      },
    }
    return tools
  }

  private async assertExtensionSourceValid(
    spaceId: string,
    packageId: string
  ): Promise<void> {
    const validation = await this.extensions!.validatePackage(
      spaceId,
      packageId
    )
    if (validation.ok) return
    const errors = validation.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .slice(0, 5)
      .map((diagnostic) => {
        const location = [diagnostic.path, diagnostic.line, diagnostic.column]
          .filter((part) => part !== undefined)
          .join(":")
        return `${diagnostic.code}${location ? ` ${location}` : ""}: ${diagnostic.message}`
      })
      .join("\n")
    throw new Error(
      `Extension source validation failed. Fix every diagnostic and run inspect_extensions with packageId again before trust or enable.${errors ? `\n${errors}` : ""}`
    )
  }

  private createVersionTools(active: ActiveRun): Record<string, any> {
    if (!this.versioning) return {}
    const versioning = this.versioning
    const snapshot = z.object({
      expectedHead: z.string().min(1).max(512).nullable(),
    })
    return {
      get_version_status: {
        description:
          "Inspect Graft versioning status, current head, staged and unstaged Space paths, conflicts, and upstream state.",
        inputSchema: z.object({}),
        execute: async () =>
          this.runObserveTool(
            active,
            "version.status",
            "Inspect version status",
            "current Space",
            undefined,
            async () => compact(await versioning.getStatus(active.spaceId))
          ),
      },
      get_version_history: {
        description:
          "Read bounded Graft version history for the current Space.",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(100).default(20),
          cursor: z.string().max(512).optional(),
        }),
        execute: async (input: { limit: number; cursor?: string }) =>
          this.runObserveTool(
            active,
            "version.history",
            "Read version history",
            compact(input, 1_000),
            undefined,
            async () =>
              compact(await versioning.getHistory(active.spaceId, input))
          ),
      },
      get_version_commit: {
        description:
          "Inspect one Graft commit, including its message, parents, and changed paths.",
        inputSchema: z.object({ commitId: z.string().min(1).max(512) }),
        execute: async ({ commitId }: { commitId: string }) =>
          this.runObserveTool(
            active,
            "version.commitDetail",
            "Inspect version commit",
            `commit=${commitId}`,
            undefined,
            async () =>
              compact(await versioning.getCommit(active.spaceId, commitId))
          ),
      },
      get_version_conflicts: {
        description:
          "Inspect detailed unresolved Graft file, schema, and Base row conflicts for the current Space.",
        inputSchema: z.object({}),
        execute: async () =>
          this.runObserveTool(
            active,
            "version.conflicts",
            "Inspect version conflicts",
            "current Space",
            undefined,
            async () => compact(await versioning.getConflicts(active.spaceId))
          ),
      },
      get_version_diff: {
        description:
          "Read a Graft diff. Use root for one version against its parent, or from/to for two versions. A path is required when including text content or Base rows.",
        inputSchema: z.object({
          root: z.string().max(512).optional(),
          from: z.string().max(512).optional(),
          to: z.string().max(512).optional(),
          path: z.string().max(1_024).optional(),
          includeContent: z.boolean().default(false),
          includeRows: z.boolean().default(false),
        }),
        execute: async (input: {
          root?: string
          from?: string
          to?: string
          path?: string
          includeContent: boolean
          includeRows: boolean
        }) =>
          this.runObserveTool(
            active,
            "version.diff",
            "Read version diff",
            compact(input, 1_000),
            input.path,
            async () => compact(await versioning.getDiff(active.spaceId, input))
          ),
      },
      enable_space_versioning: {
        description:
          "Initialize Graft versioning for this Space. Eidos applies the conversation approval mode first.",
        inputSchema: z.object({}),
        execute: async () =>
          this.runControlledTool(
            active,
            {
              name: "version.enable",
              title: "Enable Space versioning",
              risk: "modify",
            },
            "Initialize Graft for the current Space",
            "Create the Space-local .graft repository and managed ignore rules.",
            async () => versioning.enable(active.spaceId)
          ),
      },
      stage_space_path: {
        description:
          "Stage one changed Space path for the next version. Read get_version_status first and pass its exact currentHead. Eidos applies the conversation approval mode first.",
        inputSchema: snapshot.extend({ path: z.string().min(1).max(1_024) }),
        execute: async (input: { path: string; expectedHead: string | null }) =>
          this.runControlledTool(
            active,
            {
              name: "version.stage",
              title: "Stage Space path",
              risk: "modify",
              resource: input.path,
            },
            `Stage ${input.path}`,
            compact(input, 4_000),
            async () => versioning.stagePath(active.spaceId, input)
          ),
      },
      unstage_space_path: {
        description:
          "Remove one path from the next version without discarding its file changes. Pass the current head. Eidos applies the conversation approval mode first.",
        inputSchema: snapshot.extend({ path: z.string().min(1).max(1_024) }),
        execute: async (input: { path: string; expectedHead: string | null }) =>
          this.runControlledTool(
            active,
            {
              name: "version.unstage",
              title: "Unstage Space path",
              risk: "modify",
              resource: input.path,
            },
            `Unstage ${input.path}`,
            compact(input, 4_000),
            async () => versioning.unstagePath(active.spaceId, input)
          ),
      },
      commit_space_version: {
        description:
          "Create a Graft version from currently staged paths. Eidos applies the conversation approval mode first.",
        inputSchema: z.object({ message: z.string().min(1).max(4_096) }),
        execute: async (input: { message: string }) =>
          this.runControlledTool(
            active,
            {
              name: "version.commit",
              title: "Create Space version",
              risk: "modify",
            },
            input.message,
            `Commit staged Space changes with message:\n${input.message}`,
            async () => versioning.commit(active.spaceId, input)
          ),
      },
      discard_space_path_changes: {
        description:
          "Discard uncommitted changes for one Space path. This is destructive and requires the current head plus user approval.",
        inputSchema: snapshot.extend({ path: z.string().min(1).max(1_024) }),
        execute: async (input: { path: string; expectedHead: string | null }) =>
          this.runControlledTool(
            active,
            {
              name: "version.discard",
              title: "Discard Space path changes",
              risk: "modify",
              resource: input.path,
            },
            `Discard changes in ${input.path}`,
            compact(input, 4_000),
            async () => {
              await this.assertVersionMutationDoesNotTouchActiveSession(
                active,
                input.path
              )
              return versioning.discardPath(active.spaceId, {
                ...input,
                confirmed: true,
              })
            }
          ),
      },
      restore_space_path: {
        description:
          "Restore one path from a historical version without moving HEAD. This remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          revision: z.string().min(1).max(512),
          path: z.string().min(1).max(1_024),
          expectedHead: z.string().min(1).max(512),
          overwriteChanges: z.boolean().default(false),
          allowDelete: z.boolean().default(false),
        }),
        execute: async (input: {
          revision: string
          path: string
          expectedHead: string
          overwriteChanges: boolean
          allowDelete: boolean
        }) =>
          this.runControlledTool(
            active,
            {
              name: "version.restorePath",
              title: "Restore Space path",
              risk: "modify",
              resource: input.path,
            },
            `Restore ${input.path} from ${input.revision}`,
            compact(input, 4_000),
            async () => {
              await this.assertVersionMutationDoesNotTouchActiveSession(
                active,
                input.path
              )
              return versioning.restorePath(active.spaceId, input)
            }
          ),
      },
      restore_space_version: {
        description:
          "Restore the whole Space worktree from a historical version without moving HEAD. This is destructive and remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          revision: z.string().min(1).max(512),
          expectedHead: z.string().min(1).max(512),
          overwriteChanges: z.boolean().default(false),
        }),
        execute: async (input: {
          revision: string
          expectedHead: string
          overwriteChanges: boolean
        }) =>
          this.runControlledTool(
            active,
            {
              name: "version.restore",
              title: "Restore Space version",
              risk: "modify",
            },
            `Restore Space from ${input.revision}`,
            compact(input, 4_000),
            async () => {
              await this.assertVersionMutationDoesNotTouchActiveSession(active)
              return versioning.restoreVersion(active.spaceId, input)
            }
          ),
      },
      list_version_remotes: {
        description: "List configured Graft remotes for the current Space.",
        inputSchema: z.object({}),
        execute: async () =>
          this.runObserveTool(
            active,
            "version.remotes",
            "List version remotes",
            "current Space",
            undefined,
            async () => compact(await versioning.getRemotes(active.spaceId))
          ),
      },
      configure_version_remote: {
        description:
          "Add or update a Graft remote and upstream branch. This changes external synchronization configuration and remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          name: z.string().min(1).max(128).default("origin"),
          url: z.string().min(1).max(4_096),
          branch: z.string().max(512).optional(),
        }),
        execute: async (input: {
          name: string
          url: string
          branch?: string
        }) =>
          this.runControlledTool(
            active,
            {
              name: "version.configureRemote",
              title: "Configure version remote",
              risk: "external",
            },
            `Configure ${input.name}`,
            compact(input, 4_000),
            async () => versioning.configureRemote(active.spaceId, input)
          ),
      },
      remove_version_remote: {
        description:
          "Remove a Graft remote configuration. This remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          name: z.string().min(1).max(128).default("origin"),
        }),
        execute: async (input: { name: string }) =>
          this.runControlledTool(
            active,
            {
              name: "version.removeRemote",
              title: "Remove version remote",
              risk: "external",
            },
            `Remove ${input.name}`,
            compact(input, 4_000),
            async () => versioning.removeRemote(active.spaceId, input)
          ),
      },
      sync_space_version: {
        description:
          "Fetch, pull, or push a Graft remote. Pull may modify Space files and push changes external state. This remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          operation: z.enum(["fetch", "pull", "push"]),
          remote: z.string().max(128).optional(),
          branch: z.string().max(512).optional(),
          expectedHead: z.string().max(512).nullable().optional(),
        }),
        execute: async (input: {
          operation: "fetch" | "pull" | "push"
          remote?: string
          branch?: string
          expectedHead?: string | null
        }) =>
          this.runControlledTool(
            active,
            {
              name: `version.${input.operation}` as FileSpaceAgentToolRun["name"],
              title: `${input.operation[0]!.toUpperCase()}${input.operation.slice(1)} Space version`,
              risk: "external",
            },
            `${input.operation} ${input.remote ?? "origin"}`,
            compact(input, 4_000),
            async () => {
              const options = {
                remote: input.remote,
                branch: input.branch,
                expectedHead: input.expectedHead,
              }
              if (input.operation === "fetch") {
                return versioning.fetchRemote(active.spaceId, options)
              }
              if (input.operation === "pull") {
                await this.assertVersionMutationDoesNotTouchActiveSession(
                  active
                )
                return versioning.pullRemote(active.spaceId, options)
              }
              return versioning.pushRemote(active.spaceId, options)
            }
          ),
      },
      resolve_space_version_conflict: {
        description:
          "Resolve a Graft conflict with ours, theirs, or manual content already written to the Space path. This remains approval-gated unless the user selected Full access.",
        inputSchema: z.object({
          path: z.string().min(1).max(1_024),
          resolution: z.enum(["ours", "theirs", "manual"]),
          expectedHead: z.string().max(512).nullable(),
          target: z
            .object({
              table: z.string().min(1).max(255),
              rowId: z.number().int(),
            })
            .optional(),
        }),
        execute: async (input: {
          path: string
          resolution: "ours" | "theirs" | "manual"
          expectedHead: string | null
          target?: { table: string; rowId: number }
        }) =>
          this.runControlledTool(
            active,
            {
              name: "version.resolveConflict",
              title: "Resolve version conflict",
              risk: "modify",
              resource: input.path,
            },
            `Resolve ${input.path} with ${input.resolution}`,
            compact(input, 4_000),
            async () => {
              await this.assertVersionMutationDoesNotTouchActiveSession(
                active,
                input.path
              )
              return versioning.resolveConflict(active.spaceId, input)
            }
          ),
      },
    }
  }

  private async runControlledTool(
    active: ActiveRun,
    details: {
      name: FileSpaceAgentToolRun["name"]
      title: string
      risk: FileSpaceAgentToolRun["risk"]
      resource?: string
    },
    inputSummary: string,
    preview: string,
    operation: () => Promise<unknown>
  ): Promise<unknown> {
    const timestamp = now()
    const requiresApproval = shouldRequestToolApproval(
      active.approvalMode,
      details
    )
    let tool: FileSpaceAgentToolRun = {
      id: randomUUID(),
      runId: active.run.id,
      toolCallId: this.toolCallContext.getStore(),
      ...details,
      approvalMode: active.approvalMode,
      approval: requiresApproval ? "required" : "automatic",
      status: requiresApproval ? "waiting-approval" : "approved",
      inputSummary: compact(inputSummary, 1_000),
      preview: compact(preview, 4_000),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    if (requiresApproval) {
      const decisionPromise = this.waitForApproval(active, tool)
      await this.appendTool(active, tool)
      await this.refreshRunApprovalStatus(active)
      const decision = await decisionPromise
      if (active.abortController.signal.aborted) {
        tool = { ...tool, status: "canceled", updatedAt: now() }
        await this.appendTool(active, tool)
        throw new Error("Agent run was canceled")
      }
      await this.refreshRunApprovalStatus(active)
      if (decision === "deny") {
        tool = { ...tool, status: "denied", updatedAt: now() }
        await this.appendTool(active, tool)
        return {
          error: `The user denied ${details.title.toLowerCase()}. Do not claim that it ran.`,
        }
      }
      tool = { ...tool, status: "approved", updatedAt: now() }
      await this.appendTool(active, tool)
    } else {
      await this.appendTool(active, tool)
    }
    if (active.abortController.signal.aborted) {
      tool = { ...tool, status: "canceled", updatedAt: now() }
      await this.appendTool(active, tool)
      throw new Error("Agent run was canceled")
    }
    try {
      const result = await operation()
      tool = {
        ...tool,
        status: "succeeded",
        resultSummary: compact(result, 2_000),
        updatedAt: now(),
      }
      await this.appendTool(active, tool)
      return result
    } catch (error) {
      tool = {
        ...tool,
        status: active.abortController.signal.aborted ? "canceled" : "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: now(),
      }
      await this.appendTool(active, tool)
      throw error
    }
  }

  private async capturePathFingerprint(
    spaceId: string,
    relativePath: string
  ): Promise<{ digest: string; preview: string }> {
    const targetPath = normalizedPortablePath(relativePath)
    if (
      !targetPath ||
      targetPath.startsWith("../") ||
      path.isAbsolute(targetPath)
    ) {
      throw new Error("Space path is invalid")
    }
    const parent = path.posix.dirname(targetPath)
    const entries = await this.spaces.listFiles(
      spaceId,
      parent === "." ? "" : parent,
      { includeHidden: true }
    )
    const target = entries.find((entry) => entry.path === targetPath)
    if (!target) throw new Error(`Space path was not found: ${targetPath}`)

    const records = [
      `${target.kind}\0${target.path}\0${target.size}\0${target.mtimeMs}`,
    ]
    const directories = target.kind === "directory" ? [target.path] : []
    while (directories.length > 0) {
      const directory = directories.shift()!
      const children = await this.spaces.listFiles(spaceId, directory, {
        includeHidden: true,
      })
      for (const child of children) {
        records.push(
          `${child.kind}\0${child.path}\0${child.size}\0${child.mtimeMs}`
        )
        if (child.kind === "directory") directories.push(child.path)
      }
      if (records.length > 5_000) {
        throw new Error(
          "The selected directory is too large for a safe destructive Agent operation"
        )
      }
    }
    records.sort()
    const digest = createHash("sha256").update(records.join("\n")).digest("hex")
    return {
      digest,
      preview: `Approved snapshot: sha256:${digest} (${records.length} ${records.length === 1 ? "entry" : "entries"})`,
    }
  }

  private async assertPathFingerprintUnchanged(
    spaceId: string,
    relativePath: string,
    expectedDigest: string
  ): Promise<void> {
    let current: Awaited<ReturnType<typeof this.capturePathFingerprint>>
    try {
      current = await this.capturePathFingerprint(spaceId, relativePath)
    } catch {
      throw new Error(
        "The Space path changed after approval; inspect it again before retrying"
      )
    }
    if (current.digest !== expectedDigest) {
      throw new Error(
        "The Space path changed after approval; inspect it again before retrying"
      )
    }
  }

  private async assertVersionMutationDoesNotTouchActiveSession(
    active: ActiveRun,
    targetPath?: string
  ): Promise<void> {
    if (targetPath !== undefined) {
      if (!isAgentSessionPath(targetPath)) return
      throw new Error(
        "Version operations cannot replace an Agent session while that Space has an active run"
      )
    }
    if (!this.versioning) return
    const policy = await this.versioning.getAgentConversationVersioning(
      active.spaceId
    )
    if (policy.enabled) {
      throw new Error(
        "Pulling or restoring the whole Space is blocked while versioned Agent sessions are active; stop the run first"
      )
    }
  }

  private async runObserveTool(
    active: ActiveRun,
    name: FileSpaceAgentToolRun["name"],
    title: string,
    inputSummary: string,
    resource: string | undefined,
    operation: () => Promise<string>
  ): Promise<string> {
    const timestamp = now()
    let tool: FileSpaceAgentToolRun = {
      id: randomUUID(),
      runId: active.run.id,
      toolCallId: this.toolCallContext.getStore(),
      name,
      title,
      risk: "observe",
      status: "running",
      resource,
      inputSummary,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.appendTool(active, tool)
    try {
      if (active.abortController.signal.aborted) {
        throw new Error("Agent run was canceled")
      }
      const result = await operation()
      if (active.abortController.signal.aborted) {
        throw new Error("Agent run was canceled")
      }
      tool = {
        ...tool,
        status: "succeeded",
        resultSummary: compact(result, 2_000),
        updatedAt: now(),
      }
      await this.appendTool(active, tool)
      return result
    } catch (error) {
      tool = {
        ...tool,
        status: active.abortController.signal.aborted ? "canceled" : "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: now(),
      }
      await this.appendTool(active, tool)
      throw error
    }
  }

  private async runWriteFileTool(
    active: ActiveRun,
    input: {
      path: string
      expectedContentDigest: string
      content: string
      summary: string
    }
  ): Promise<string> {
    const timestamp = now()
    let tool: FileSpaceAgentToolRun = {
      id: randomUUID(),
      runId: active.run.id,
      toolCallId: this.toolCallContext.getStore(),
      name: "space.files.writeText",
      title: "Modify Space file",
      risk: "modify",
      approvalMode: active.approvalMode,
      status: "running",
      resource: input.path,
      inputSummary: input.summary,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.appendTool(active, tool)
    let current: Awaited<ReturnType<SpaceManagementService["readFile"]>>
    try {
      current = await this.spaces.readFile(
        active.spaceId,
        input.path,
        MAX_PATCH_CHARS
      )
      if (current.contentDigest !== input.expectedContentDigest) {
        throw new Error(
          "The Space file changed after it was read; read it again before proposing a patch"
        )
      }
      if (current.content === input.content) {
        const resultSummary =
          "No change was required; the proposed content already matches the Space file."
        tool = {
          ...tool,
          status: "succeeded",
          resultSummary,
          updatedAt: now(),
        }
        await this.appendTool(active, tool)
        return resultSummary
      }
    } catch (error) {
      tool = {
        ...tool,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: now(),
      }
      await this.appendTool(active, tool)
      throw error
    }
    const requiresApproval = shouldRequestToolApproval(
      active.approvalMode,
      tool
    )
    tool = {
      ...tool,
      approval: requiresApproval ? "required" : "automatic",
      status: requiresApproval ? "waiting-approval" : "approved",
      preview: diffPreview(input.path, current.content, input.content),
      updatedAt: now(),
    }
    if (requiresApproval) {
      const decisionPromise = this.waitForApproval(active, tool)
      await this.appendTool(active, tool)
      await this.refreshRunApprovalStatus(active)
      const decision = await decisionPromise
      if (active.abortController.signal.aborted) {
        tool = { ...tool, status: "canceled", updatedAt: now() }
        await this.appendTool(active, tool)
        throw new Error("Agent run was canceled")
      }
      await this.refreshRunApprovalStatus(active)
      if (decision === "deny") {
        tool = { ...tool, status: "denied", updatedAt: now() }
        await this.appendTool(active, tool)
        return "The user denied this file change. Do not claim that it was applied."
      }
      tool = { ...tool, status: "approved", updatedAt: now() }
      await this.appendTool(active, tool)
    } else {
      await this.appendTool(active, tool)
    }
    if (active.abortController.signal.aborted) {
      tool = { ...tool, status: "canceled", updatedAt: now() }
      await this.appendTool(active, tool)
      throw new Error("Agent run was canceled")
    }
    try {
      const saved = await this.spaces.writeFile(
        active.spaceId,
        input.path,
        input.content,
        current.mtimeMs,
        current.contentDigest
      )
      tool = {
        ...tool,
        status: "succeeded",
        resultSummary: `Saved ${saved.path} (${saved.size} bytes, digest ${saved.contentDigest})`,
        updatedAt: now(),
      }
      await this.appendTool(active, tool)
      return tool.resultSummary ?? "The Space file was saved."
    } catch (error) {
      tool = {
        ...tool,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: now(),
      }
      await this.appendTool(active, tool)
      throw error
    }
  }

  private waitForApproval(
    active: ActiveRun,
    tool: FileSpaceAgentToolRun
  ): Promise<FileSpaceAgentApprovalDecision> {
    const toolRunId = tool.id
    return new Promise((resolve) => {
      let finished = false
      let timeout: NodeJS.Timeout
      const finish = (decision: FileSpaceAgentApprovalDecision) => {
        if (finished) return
        finished = true
        clearTimeout(timeout)
        this.pendingApprovals.delete(toolRunId)
        active.abortController.signal.removeEventListener("abort", onAbort)
        resolve(decision)
      }
      const onAbort = () => finish("deny")
      timeout = setTimeout(() => finish("deny"), APPROVAL_TIMEOUT_MS)
      active.abortController.signal.addEventListener("abort", onAbort, {
        once: true,
      })
      this.pendingApprovals.set(toolRunId, {
        spaceId: active.spaceId,
        conversationId: active.run.conversationId,
        runId: active.run.id,
        tool,
        resolve: finish,
        timeout,
      })
      if (active.abortController.signal.aborted) {
        clearTimeout(timeout)
        this.pendingApprovals.delete(toolRunId)
        finish("deny")
      }
    })
  }

  private async appendTool(
    active: ActiveRun,
    tool: FileSpaceAgentToolRun
  ): Promise<void> {
    await active.store.append(active.run.conversationId, {
      type: "tool.status",
      data: { tool },
    })
  }

  private async refreshRunApprovalStatus(active: ActiveRun): Promise<void> {
    const hasPendingApproval = [...this.pendingApprovals.values()].some(
      (approval) => approval.runId === active.run.id
    )
    const status = hasPendingApproval ? "waiting-approval" : "running"
    if (active.run.status !== status) {
      await this.setRunStatus(active, status)
    }
  }

  private async setRunStatus(
    active: ActiveRun,
    status: FileSpaceAgentRun["status"],
    updates: Pick<FileSpaceAgentRun, "error"> = {}
  ): Promise<void> {
    active.run = {
      ...active.run,
      ...updates,
      status,
      updatedAt: now(),
    }
    active.runtimeState.save({ run: active.run, message: active.message })
    await active.store.append(active.run.conversationId, {
      type: "run.status",
      data: { run: active.run },
    })
    if (TERMINAL_RUN_STATES.has(status)) {
      await active.store.updateConversation(active.run.conversationId, {})
    }
  }

  private async resolveResourceContext(
    spaceId: string,
    input: StartFileSpaceAgentRunInput["context"]
  ): Promise<FileSpaceAgentResourceContext | null> {
    const target = contextTarget(input?.sourceUrl)
    if (!target) return null
    const capturedAt = now()
    if (target.path.toLowerCase().endsWith(".base")) {
      const snapshot = await this.spaces.getBaseSnapshotReadOnly(
        spaceId,
        target.path
      )
      const tableId = target.tableId ?? snapshot.metadata.defaultTableId
      const row =
        tableId && target.rowId
          ? await this.spaces.getBaseTableRow(
              spaceId,
              target.path,
              tableId,
              target.rowId
            )
          : null
      return {
        kind: row ? "base-row" : "base",
        path: target.path,
        tableId,
        rowId: row ? target.rowId : undefined,
        baseFingerprint: `${snapshot.metadata.formatVersion}:${snapshot.metadata.schemaVersion}:${snapshot.metadata.updatedAt}`,
        excerpt: compact(row ?? snapshot, MAX_CONTEXT_CHARS),
        capturedAt,
        reason: "active-tab",
      }
    }
    let file: Awaited<ReturnType<SpaceManagementService["readFile"]>> | null =
      null
    let excerpt: string
    let mtimeMs: number
    try {
      file = await this.spaces.readFile(spaceId, target.path, MAX_CONTEXT_CHARS)
      excerpt = file.content
      mtimeMs = file.mtimeMs
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === "invalid-encoding") {
        const preview = await this.spaces.readFilePreview(spaceId, target.path)
        if (preview.kind !== "binary") return null
        const mediaType = imageMediaType(target.path)
        return {
          kind: mediaType ? "image" : "binary",
          path: target.path,
          mediaType,
          size: preview.size,
          mtimeMs: preview.mtimeMs,
          excerpt: mediaType
            ? `Image attachment (${mediaType}, ${preview.size} bytes)`
            : `Binary resource (${preview.size} bytes)`,
          capturedAt,
          reason: "active-tab",
        }
      }
      if (code !== "file-too-large") throw error
      const preview = await this.spaces.readFilePreview(spaceId, target.path)
      if (preview.kind !== "text") return null
      excerpt = preview.content.slice(0, MAX_CONTEXT_CHARS)
      mtimeMs = preview.mtimeMs
    }
    const requestedSelection = input?.selection
      ?.trim()
      .slice(0, MAX_SELECTION_CHARS)
    const selection =
      requestedSelection && excerpt.includes(requestedSelection)
        ? requestedSelection
        : undefined
    return {
      kind: target.path.toLowerCase().endsWith(".md") ? "markdown" : "text",
      path: target.path,
      heading: target.heading,
      selection,
      excerpt: selection ?? excerpt,
      ...(file ? { contentDigest: file.contentDigest } : {}),
      mtimeMs,
      capturedAt,
      reason: selection ? "selection" : "active-tab",
    }
  }

  private async attachBinaryContext(
    active: ActiveRun,
    context: FileSpaceAgentResourceContext | null,
    messages: Array<{ role: string; parts: Array<Record<string, unknown>> }>
  ): Promise<void> {
    if (context?.kind !== "image" || !context.mediaType) return
    if ((context.size ?? 0) > MAX_BINARY_CONTEXT_BYTES) {
      throw new Error(
        `Image context exceeds the ${MAX_BINARY_CONTEXT_BYTES / 1024 / 1024} MiB Agent limit`
      )
    }
    const file = await this.spaces.readBinaryFile(active.spaceId, context.path)
    if (file.size > MAX_BINARY_CONTEXT_BYTES) {
      throw new Error(
        `Image context exceeds the ${MAX_BINARY_CONTEXT_BYTES / 1024 / 1024} MiB Agent limit`
      )
    }
    const user = [...messages]
      .reverse()
      .find((message) => message.role === "user")
    if (!user) return
    user.parts.push({
      type: "file",
      mediaType: context.mediaType,
      filename: path.basename(context.path),
      url: `data:${context.mediaType};base64,${Buffer.from(file.content).toString("base64")}`,
    })
  }

  private buildInstructions(
    approvalMode: FileSpaceAgentApprovalMode,
    context: FileSpaceAgentResourceContext | null
  ): string {
    const approvalInstruction =
      approvalMode === "ask"
        ? "The user selected Ask for approval. Eidos blocks every mutating or external tool until the user decides."
        : approvalMode === "auto-safe"
          ? "The user selected Approve for me. Eidos may automatically approve safe typed Space changes, but still blocks destructive, Extension trust or execution, and external operations for a user decision."
          : "The user selected Full access. Eidos may automatically approve all typed Agent tools, including destructive Space actions and external web or Version actions. File access remains confined to the current Space, and every tool still enforces input validation."
    return [
      "You are the native Eidos File Space Agent. This runtime is independent from the legacy DataSpace Agent.",
      "Use only the native Space, Web, Extension, Base, and Version tools provided to you. Never invent file contents, web sources, or claim an operation succeeded before its tool reports success.",
      "Use web_search for discovery and web_fetch when the answer depends on a source body. Treat search snippets as leads, not complete evidence, include the source URLs used in the answer, and never invent a citation.",
      "Read an existing file immediately before write_space_file and pass its exact contentDigest. Use create_space_file only for a path that does not exist.",
      "Extension source is canonical under .eidos/extensions. Create a template, edit files inside its package through Space file tools, then call inspect_extensions with that packageId and require sourceValidation.ok=true before trusting or enabling the exact snapshot. Use uninstall_extension rather than deleting an Extension package root.",
      "The public Extension worker SDK is closed and exact: ExtensionContext exposes extensionId, subscriptions.add, commands.register, space.files.readText(path), and window.showNotice/confirm/select/openPanel. There is no listFiles, readdir, glob, file-write, database, shell, or unrestricted network API. Never guess an SDK member. If the requested Extension cannot be implemented with this surface, explain the missing capability instead of inventing one.",
      "Version operations are allowed through the typed Version tools. Read current status first, pass the exact current head to guarded mutations, and never access .graft directly.",
      "Do not request, reveal, or persist credentials. Never treat an approval mode as access outside the current Space or its typed tools.",
      approvalInstruction,
      context
        ? `The user opened Agent from this immutable resource context:\n${compact(context, MAX_CONTEXT_CHARS)}`
        : "No active resource was captured. Search the Space when the request depends on its contents.",
    ].join("\n\n")
  }

  private async recoverConversation(
    spaceId: string,
    store: FileSpaceAgentSessionStore,
    conversationId: string
  ): Promise<void> {
    const key = `${spaceId}\0${conversationId}`
    if (this.recoveredConversations.has(key)) return
    this.recoveredConversations.add(key)
    const conversation = await store.loadConversation(conversationId)
    if (!conversation) return
    const events = await store.readEvents(conversationId)
    const runtimeState = this.getRuntimeState(spaceId)
    const runtimeSnapshot = runtimeState.getConversation(conversationId)
    const lastRunEvent = [...events]
      .reverse()
      .find(
        (
          event
        ): event is Extract<FileSpaceAgentEvent, { type: "run.status" }> =>
          event.type === "run.status"
      )
    const recoveredRun = runtimeSnapshot?.run ?? lastRunEvent?.data.run
    if (
      recoveredRun &&
      !TERMINAL_RUN_STATES.has(recoveredRun.status) &&
      !this.activeRuns.has(recoveredRun.id)
    ) {
      if (
        runtimeSnapshot?.message.parts.length &&
        !buildFileSpaceAgentMessages(events).some(
          (message) => message.id === runtimeSnapshot.message.id
        )
      ) {
        await store.append(conversationId, {
          type: "message.snapshot",
          data: {
            message: runtimeSnapshot.message,
            runId: runtimeSnapshot.run.id,
          },
        })
      }
      const latestTools = new Map<string, FileSpaceAgentToolRun>()
      for (const event of events) {
        if (
          event.type === "tool.status" &&
          event.data.tool.runId === recoveredRun.id
        ) {
          latestTools.set(event.data.tool.id, event.data.tool)
        }
      }
      for (const tool of latestTools.values()) {
        if (TERMINAL_TOOL_STATES.has(tool.status)) continue
        const outcomeUnknown = tool.status === "approved"
        await store.append(conversationId, {
          type: "tool.status",
          data: {
            tool: {
              ...tool,
              status: outcomeUnknown ? "outcome-unknown" : "interrupted",
              error: outcomeUnknown
                ? "Eidos restarted after this tool was approved. Its side effect may have completed; inspect the target before retrying."
                : "Eidos restarted before this tool completed.",
              updatedAt: now(),
            },
          },
        })
      }
      await store.append(conversationId, {
        type: "run.status",
        data: {
          run: {
            ...recoveredRun,
            status: "interrupted",
            updatedAt: now(),
            error: "Eidos restarted before this Agent run completed.",
          },
        },
      })
      await store.updateConversation(conversationId, {})
    }
    if (runtimeSnapshot) runtimeState.deleteRun(runtimeSnapshot.run.id)
  }

  private async releaseSpace(spacePath: string): Promise<void> {
    const canonicalPath = path.resolve(spacePath)
    const spaceIds = new Set(
      this.registry
        .getAllSpaces()
        .filter((space) => path.resolve(space.path) === canonicalPath)
        .map((space) => space.id)
    )
    const runs = [...this.activeRuns.values()].filter((active) =>
      spaceIds.has(active.spaceId)
    )
    await Promise.all(
      runs.map((active) =>
        this.stopRun(active.spaceId, active.run.conversationId, active.run.id)
      )
    )
    await Promise.all(runs.map((active) => active.completion))
    for (const spaceId of spaceIds) {
      this.stores.delete(spaceId)
      this.localStates.delete(spaceId)
      this.runtimeStates.get(spaceId)?.close()
      this.runtimeStates.delete(spaceId)
      for (const key of this.recoveredConversations) {
        if (key.startsWith(`${spaceId}\0`)) {
          this.recoveredConversations.delete(key)
        }
      }
    }
  }

  private async releaseAllSpaces(): Promise<void> {
    const runs = [...this.activeRuns.values()]
    await Promise.all(
      runs.map((active) =>
        this.stopRun(active.spaceId, active.run.conversationId, active.run.id)
      )
    )
    await Promise.all(runs.map((active) => active.completion))
    this.stores.clear()
    this.localStates.clear()
    for (const runtimeState of this.runtimeStates.values()) runtimeState.close()
    this.runtimeStates.clear()
    this.recoveredConversations.clear()
  }

  private getStore(spaceId: string): FileSpaceAgentSessionStore {
    const space = this.registry.getSpace(spaceId)
    if (!space || space.mode !== "file") {
      throw new Error("File Space Agent requires a registered file-based Space")
    }
    const existing = this.stores.get(spaceId)
    if (existing) return existing
    const store = new FileSpaceAgentSessionStore(
      path.join(space.path, ".eidos", "agent", "sessions")
    )
    this.stores.set(spaceId, store)
    return store
  }

  private getLocalState(spaceId: string): FileSpaceAgentLocalStateStore {
    const space = this.registry.getSpace(spaceId)
    if (!space || space.mode !== "file") {
      throw new Error("File Space Agent requires a registered file-based Space")
    }
    const existing = this.localStates.get(spaceId)
    if (existing) return existing
    const state = new FileSpaceAgentLocalStateStore(
      path.join(space.path, ".eidos", "agent", "local")
    )
    this.localStates.set(spaceId, state)
    return state
  }

  private getRuntimeState(spaceId: string): FileSpaceAgentRuntimeStateStore {
    const space = this.registry.getSpace(spaceId)
    if (!space || space.mode !== "file") {
      throw new Error("File Space Agent requires a registered file-based Space")
    }
    const existing = this.runtimeStates.get(spaceId)
    if (existing) return existing
    const state = new FileSpaceAgentRuntimeStateStore(
      path.join(space.path, ".eidos", "agent", "local")
    )
    this.runtimeStates.set(spaceId, state)
    return state
  }
}
