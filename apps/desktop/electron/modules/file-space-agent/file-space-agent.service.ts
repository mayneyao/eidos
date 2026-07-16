import { randomUUID } from "node:crypto"
import path from "node:path"

import { IpcServiceBase } from "@eidos.space/electron-ipc"
import {
  extractReasoningMiddleware,
  stepCountIs,
  ToolLoopAgent,
  wrapLanguageModel,
} from "ai"
import { z } from "zod"

import {
  buildProviderOptions,
  resolveProviderForModel,
} from "@/packages/ai/server/model"

import { IpcInjectable, Inject } from "../../common/di"
import { ConfigManager } from "../config/config-manager"
import { SpaceManagementService } from "../space-management/space-management.service"
import { SpaceRegistry } from "../space-management/space-registry"
import { FileSpaceAgentSessionStore } from "./file-space-agent-session-store"
import type {
  FileSpaceAgentApprovalDecision,
  FileSpaceAgentConversation,
  FileSpaceAgentConversationSnapshot,
  FileSpaceAgentEvent,
  FileSpaceAgentResourceContext,
  FileSpaceAgentRun,
  FileSpaceAgentToolRun,
  StartFileSpaceAgentRunInput,
  StartFileSpaceAgentRunResult,
} from "./types"

const MAX_PROMPT_CHARS = 32_000
const MAX_CONTEXT_CHARS = 24_000
const MAX_SELECTION_CHARS = 8_000
const MAX_TOOL_RESULT_CHARS = 48_000
const MAX_PATCH_CHARS = 256_000
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1_000
const TERMINAL_RUN_STATES = new Set<FileSpaceAgentRun["status"]>([
  "succeeded",
  "failed",
  "canceled",
  "interrupted",
])

interface ActiveRun {
  spaceId: string
  store: FileSpaceAgentSessionStore
  run: FileSpaceAgentRun
  abortController: AbortController
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

@IpcInjectable("file-space-agent")
export class FileSpaceAgentService extends IpcServiceBase {
  private readonly stores = new Map<string, FileSpaceAgentSessionStore>()
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly startingConversations = new Set<string>()
  private readonly pendingApprovals = new Map<string, PendingApproval>()
  private readonly recoveredConversations = new Set<string>()

  constructor(
    @Inject(SpaceRegistry) private readonly registry: SpaceRegistry,
    @Inject(SpaceManagementService)
    private readonly spaces: SpaceManagementService,
    @Inject(ConfigManager) private readonly config: ConfigManager
  ) {
    super()
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
    return store.listConversations()
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
    return {
      conversation,
      events: conversation
        ? await store.readEvents(conversationId, afterSequence)
        : [],
      activeRun: activeRun?.run ?? null,
    }
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
    const prompt = input.prompt.trim()
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
    const store = this.getStore(input.spaceId)
    await this.recoverConversation(input.spaceId, store, input.conversationId)
    const conversationKey = `${input.spaceId}\0${input.conversationId}`
    const alreadyActive = [...this.activeRuns.values()].some(
      (item) =>
        item.spaceId === input.spaceId &&
        item.run.conversationId === input.conversationId
    )
    if (alreadyActive || this.startingConversations.has(conversationKey)) {
      throw new Error("This Agent conversation already has an active run")
    }
    this.startingConversations.add(conversationKey)

    try {
      const timestamp = now()
      const existing = await store.loadConversation(input.conversationId)
      const conversation = await store.createConversation(
        existing ?? {
          id: input.conversationId,
          spaceId: input.spaceId,
          title: titleFromPrompt(prompt),
          model: input.model,
          createdAt: timestamp,
          updatedAt: timestamp,
          latestSequence: 0,
        }
      )
      if (conversation.spaceId !== input.spaceId) {
        throw new Error("Agent conversation belongs to another Space")
      }

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
      await store.append(input.conversationId, {
        type: "message.created",
        data: { id: randomUUID(), role: "user", text: prompt, runId },
      })
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
        abortController: new AbortController(),
      }
      this.activeRuns.set(runId, active)
      void this.executeRun(active, context).catch((error) => {
        console.error("[file-space-agent] background run failed", error)
      })
      return { run, conversation }
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
      const { modelId, provider, providerType } = resolveProviderForModel(
        run.model,
        aiConfig
      )
      if (!modelId) throw new Error("The selected Agent model is unavailable")
      const tools = this.createTools(active)
      const providerOptions = buildProviderOptions(providerType, "off")
      const agent = new ToolLoopAgent({
        model: wrapLanguageModel({
          model: provider(modelId),
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        }),
        instructions: this.buildInstructions(context),
        tools,
        stopWhen: stepCountIs(16),
        ...(providerOptions ? { providerOptions } : {}),
      })
      const messages = await this.buildModelMessages(store, run.conversationId)
      const result = await agent.stream({
        messages: messages as any,
        abortSignal: abortController.signal,
      })
      for await (const part of result.fullStream) {
        if (part.type === "text-delta" && part.text) {
          await store.append(run.conversationId, {
            type: "assistant.delta",
            data: {
              messageId: run.messageId,
              runId: run.id,
              text: part.text,
            },
          })
        } else if (part.type === "error") {
          throw part.error
        } else if (part.type === "tool-error") {
          throw part.error
        }
      }
      if (abortController.signal.aborted) {
        throw new Error("Agent run was canceled")
      }
      await store.append(run.conversationId, {
        type: "assistant.completed",
        data: { messageId: run.messageId, runId: run.id },
      })
      await this.setRunStatus(active, "succeeded")
    } catch (error) {
      const canceled = abortController.signal.aborted
      if (!canceled) {
        console.error("[file-space-agent] run failed", {
          runId: run.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      await this.setRunStatus(active, canceled ? "canceled" : "failed", {
        error: canceled
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
      })
    } finally {
      this.activeRuns.delete(run.id)
    }
  }

  private createTools(active: ActiveRun): Record<string, any> {
    return {
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
              return compact(results)
            }
          ),
      },
      read_space_file: {
        description:
          "Read a public UTF-8 text file from the current Eidos Space. The result includes the digest required by patch_space_file.",
        inputSchema: z.object({ path: z.string().min(1).max(1_024) }),
        execute: async ({ path: relativePath }: { path: string }) =>
          this.runObserveTool(
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
          ),
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
      patch_space_file: {
        description:
          "Propose replacing a public text file in the current Eidos Space. You must first read the file and pass its exact contentDigest. Eidos shows a diff and waits for user approval before writing.",
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
        }) => this.runPatchTool(active, input),
      },
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

  private async runPatchTool(
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
      name: "space.files.patchText",
      title: "Modify Space file",
      risk: "modify",
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
    tool = {
      ...tool,
      status: "waiting-approval",
      preview: diffPreview(input.path, current.content, input.content),
      updatedAt: now(),
    }
    const decisionPromise = this.waitForApproval(active, tool)
    await this.appendTool(active, tool)
    await this.setRunStatus(active, "waiting-approval")
    const decision = await decisionPromise
    if (active.abortController.signal.aborted) {
      tool = { ...tool, status: "canceled", updatedAt: now() }
      await this.appendTool(active, tool)
      throw new Error("Agent run was canceled")
    }
    await this.setRunStatus(active, "running")
    if (decision === "deny") {
      tool = { ...tool, status: "denied", updatedAt: now() }
      await this.appendTool(active, tool)
      return "The user denied this file change. Do not claim that it was applied."
    }
    tool = { ...tool, status: "approved", updatedAt: now() }
    await this.appendTool(active, tool)
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
      const finish = (decision: FileSpaceAgentApprovalDecision) => {
        active.abortController.signal.removeEventListener("abort", onAbort)
        resolve(decision)
      }
      const onAbort = () => finish("deny")
      const timeout = setTimeout(() => {
        this.pendingApprovals.delete(toolRunId)
        finish("deny")
      }, APPROVAL_TIMEOUT_MS)
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
    await active.store.append(active.run.conversationId, {
      type: "run.status",
      data: { run: active.run },
    })
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
      if ((error as { code?: string }).code !== "file-too-large") throw error
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
      contentDigest: file?.contentDigest,
      mtimeMs,
      capturedAt,
      reason: selection ? "selection" : "active-tab",
    }
  }

  private buildInstructions(
    context: FileSpaceAgentResourceContext | null
  ): string {
    return [
      "You are Eidos Agent operating in one file-based Space.",
      "Use the typed Space tools to verify facts. Never invent file contents or claim a change was applied before the tool reports success.",
      "Read a file immediately before proposing a patch and pass its exact contentDigest.",
      "Do not request or expose credentials. Do not perform version control operations.",
      context
        ? `The user opened Agent from this immutable resource context:\n${compact(context, MAX_CONTEXT_CHARS)}`
        : "No active resource was captured. Search the Space when the request depends on its contents.",
    ].join("\n\n")
  }

  private async buildModelMessages(
    store: FileSpaceAgentSessionStore,
    conversationId: string
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const events = await store.readEvents(conversationId)
    const assistantText = new Map<string, string>()
    const completed = new Set<string>()
    for (const event of events) {
      if (event.type === "assistant.delta") {
        assistantText.set(
          event.data.messageId,
          `${assistantText.get(event.data.messageId) ?? ""}${event.data.text}`
        )
      } else if (event.type === "assistant.completed") {
        completed.add(event.data.messageId)
      }
    }
    const messages: Array<{ role: "user" | "assistant"; content: string }> = []
    for (const event of events) {
      if (event.type === "message.created") {
        messages.push({ role: "user", content: event.data.text })
      }
      if (
        event.type === "assistant.completed" &&
        completed.has(event.data.messageId)
      ) {
        const text = assistantText.get(event.data.messageId)
        if (text) messages.push({ role: "assistant", content: text })
      }
    }
    return messages
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
    const lastRunEvent = [...events]
      .reverse()
      .find(
        (
          event
        ): event is Extract<FileSpaceAgentEvent, { type: "run.status" }> =>
          event.type === "run.status"
      )
    if (
      lastRunEvent &&
      !TERMINAL_RUN_STATES.has(lastRunEvent.data.run.status) &&
      !this.activeRuns.has(lastRunEvent.data.run.id)
    ) {
      await store.append(conversationId, {
        type: "run.status",
        data: {
          run: {
            ...lastRunEvent.data.run,
            status: "interrupted",
            updatedAt: now(),
            error: "Eidos restarted before this Agent run completed.",
          },
        },
      })
    }
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
}
