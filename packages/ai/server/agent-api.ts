import { AgentSessionStore } from "@/packages/core/agent-session/agent-session-store"
import type { DataSpace } from "@/packages/core/data-space"
import type { MessageMetadata } from "@/packages/core/types"
import type {
  UIMessage,
  StreamTextResult,
  ToolSet,
  LanguageModelUsage,
} from "ai"
import {
  ToolLoopAgent,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  extractReasoningMiddleware,
  isToolUIPart,
  smoothStream,
  stepCountIs,
  wrapLanguageModel,
} from "ai"
import type { AIFormValues } from "../config"
import {
  buildAgentFs,
  createBashTool,
  createFileTools,
  createWebSearchTool,
  serverTools,
} from "../tools"
import { AgentContext } from "./agent-context"
import { buildProviderOptions, resolveProviderForModel } from "./model"
import { withPermission, type PermissionServerLike } from "../permission"
import { BashTransformPipeline, CommandCollectorPlugin } from "just-bash"

// Singleton pipeline for parsing bash commands and collecting command names
const bashParsePipeline = new BashTransformPipeline().use(
  new CommandCollectorPlugin()
)

/** UIMessage type with metadata */
type MessageWithMeta = UIMessage<MessageMetadata>

export interface IAgentData {
  goal: string
  /** UIMessage[] with metadata from useChat */
  messages: MessageWithMeta[]
  systemPrompt?: string
  /** Model identifier in "modelId@providerName" format */
  model: string
  space?: string
  id: string
  tools?: Record<string, unknown>
  thinking?: "off" | "low" | "medium" | "high"
  skills?: string[]
}

export type ThinkingLevel = NonNullable<IAgentData["thinking"]>

/**
 * Sanitize messages: an aborted stream may leave tool invocations in
 * an incomplete state (e.g. input-streaming / input-available without output).
 * convertToModelMessages rejects these, so strip them before conversion.
 */
function sanitizeMessages(messages: MessageWithMeta[]): MessageWithMeta[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant" || !msg.parts) return msg
    const hasIncompleteTool = msg.parts.some(
      (p) =>
        isToolUIPart(p) &&
        p.state !== "output-available" &&
        p.state !== "output-error" &&
        p.state !== "output-denied"
    )
    if (!hasIncompleteTool) return msg
    return {
      ...msg,
      parts: msg.parts.filter(
        (p) =>
          !isToolUIPart(p) ||
          p.state === "output-available" ||
          p.state === "output-error" ||
          p.state === "output-denied"
      ),
    }
  })
}

export interface PreparedAgent {
  agent: ToolLoopAgent
  modelMessages: any[]
  store: AgentSessionStore | null
  sessionGoal: string
  id: string
  modelAndProvider: string
  space: string
  createdAt: string
  existingMeta: any
  messages: MessageWithMeta[]
  aiConfig: AIFormValues | undefined
  startTime: number // Date.now() - Unix timestamp for message.createdAt
  perfStartTime: number // performance.now() - for calculating duration
}

export interface AgentContextOptions {
  getDataspace: (space: string) => Promise<DataSpace | null>
  getSpacePath?: (space: string) => string | undefined
  signal?: AbortSignal
  getAIConfig?: () => AIFormValues | undefined
  getSecrets?: () => Promise<Record<string, string>>
  logger?: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  }
  permissionServer?: PermissionServerLike
}

/**
 * Prepare an agent for execution. Builds tools, context, model, and
 * persists initial session meta. Returns everything needed to stream.
 */
export async function prepareAgent(
  data: IAgentData,
  ctx?: AgentContextOptions
): Promise<PreparedAgent> {
  const {
    goal,
    messages,
    systemPrompt,
    model: modelAndProvider,
    space,
    id,
    tools,
    thinking,
    skills,
  } = data

  const aiConfig = ctx?.getAIConfig?.()
  const log = ctx?.logger ?? console

  log.info("[agent] ▶ start", {
    id,
    goal: goal.slice(0, 80),
    model: modelAndProvider,
    space,
    messageCount: messages.length,
    toolCount: Object.keys(tools ?? {}).length,
  })

  const { modelId, provider, providerType } = resolveProviderForModel(
    modelAndProvider,
    aiConfig
  )
  const llmodel = provider(modelId)
  const dataspace = space ? await ctx?.getDataspace(space) : null
  log.info("[agent] ▶ dataspace resolved", {
    space,
    hasDataspace: !!dataspace,
    hasCtx: !!ctx,
  })
  const store = dataspace ? new AgentSessionStore(dataspace) : null
  const existingMeta = store ? await store.loadMeta(id) : null
  const sessionGoal = existingMeta?.goal || goal

  // AgentContext handles skill discovery, instruction injection, and exposes skill assets
  const agentCtx = await AgentContext.create({
    goal: sessionGoal,
    tools: [],
    systemPrompt,
    skills,
    logger: ctx?.logger,
  })

  // Build shared filesystem and tools (bash + read/write/edit)
  let fsTools: Record<string, any> = {}
  let bashWithDs: Record<string, any> = {}
  if (dataspace) {
    const spacePath = space ? ctx?.getSpacePath?.(space) : undefined
    const fs = await buildAgentFs({ dataspace, spacePath })
    const secrets = ctx?.getSecrets ? await ctx.getSecrets() : {}
    bashWithDs = {
      bash: createBashTool(
        fs,
        agentCtx.skillInstructions ?? undefined,
        dataspace,
        secrets
      ),
    }
    fsTools = createFileTools(fs)
  }

  const mergedTools: Record<string, any> = {
    ...serverTools,
    "web-search": createWebSearchTool(aiConfig?.exaApiKey),
    ...fsTools,
    ...bashWithDs,
    ...(agentCtx.skillTool ?? {}),
    ...(tools ?? {}),
  }

  // When a permission server is available (desktop mode), wrap write/edit/bash tools
  // so they require user permission before executing.
  const permissionServer = ctx?.permissionServer
  if (permissionServer) {
    if (mergedTools["file-write"]) {
      mergedTools["file-write"] = withPermission(mergedTools["file-write"], {
        toolName: "file-write",
        sessionId: id,
        permissionServer,
      })
    }
    if (mergedTools["file-edit"]) {
      mergedTools["file-edit"] = withPermission(mergedTools["file-edit"], {
        toolName: "file-edit",
        sessionId: id,
        permissionServer,
      })
    }
    if (mergedTools.bash) {
      mergedTools.bash = withPermission(mergedTools.bash, {
        toolName: "bash",
        sessionId: id,
        permissionServer,
        requiresPermission: (input: any) => {
          const cmd = (input?.command ?? "") as string
          if (!cmd.trim()) return false

          // Check for redirect or pipe to dataspace paths
          // These write to protected mounts regardless of command name
          const mountPattern =
            /(?:>|>>)\s*['"]?\/(?:dataspace|journals|extensions|agent)\//
          const teeToPath =
            /\btee\s+['"]?\/(?:dataspace|journals|extensions|agent)\//
          if (mountPattern.test(cmd) || teeToPath.test(cmd)) {
            return "bash:redirect"
          }

          // Parse command with AST-based parser to extract actual command names
          let commands: string[] = []
          try {
            const result = bashParsePipeline.transform(cmd)
            commands = ((result.metadata as any).commands as string[]) ?? []
          } catch {
            // If AST parsing fails, fall back to requiring permission
            return true
          }

          // Commands that are always read-only (safe to skip approval)
          const safeCommands = new Set([
            "ls",
            "cat",
            "head",
            "tail",
            "rg",
            "grep",
            "find",
            "wc",
            "sort",
            "cd",
            "pwd",
            "echo",
            "printf",
          ])

          // If any command is NOT safe, require permission with a cache key prefix
          for (const cmdName of commands) {
            if (safeCommands.has(cmdName)) continue
            // Special case: eidos subcommands can be read-only
            if (
              cmdName === "eidos" &&
              /^eidos\s+(record\s+query|view(?!.*update|.*delete))\b/.test(cmd)
            )
              continue

            // Build cache key like "bash:eidos record update" or "bash:rm"
            // Extract subcommand prefix: positional args that don't start with -
            const parts = cmd.trim().split(/\s+/)
            const idx = parts.indexOf(cmdName)
            if (idx === -1) {
              return `bash:${cmdName}`
            }

            const subs: string[] = []
            for (let i = idx + 1; i < parts.length; i++) {
              const p = parts[i]
              if (p.startsWith("-") || p.startsWith("{") || /^["']/.test(p))
                break
              if (subs.length >= 2) break
              subs.push(p)
            }
            return subs.length > 0
              ? `bash:${cmdName} ${subs.join(" ")}`
              : `bash:${cmdName}`
          }
          return false
        },
      })
    }
  }

  log.info("[agent] ▶ tools merged", {
    serverTools: Object.keys(serverTools),
    clientTools: Object.keys(tools ?? {}),
    total: Object.keys(mergedTools).length,
  })

  const providerOptions = buildProviderOptions(providerType, thinking ?? "off")

  const agent = new ToolLoopAgent({
    model: wrapLanguageModel({
      model: llmodel,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    }),
    instructions: agentCtx.buildInstructions(),
    tools: mergedTools as Record<string, any>,
    stopWhen: stepCountIs(100),
    ...(providerOptions ? { providerOptions } : {}),
  })

  const modelMessages = await convertToModelMessages(
    agentCtx.buildMessages(sanitizeMessages(messages))
  )

  // Write initial metadata before streaming so the session is visible in history.
  const createdAt = existingMeta?.createdAt || new Date().toISOString()
  if (store) {
    await store.saveMeta(id, {
      id,
      goal: sessionGoal,
      model: modelAndProvider,
      space: space ?? "",
      createdAt,
      parentId: existingMeta?.parentId,
      forkedMessageId: existingMeta?.forkedMessageId,
      permissions: existingMeta?.permissions,
    })
    // Persist the latest user message so it's not lost if the stream crashes
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMsg) {
      // Add metadata to the user message (including creation time and model info)
      const userMessageWithMeta: MessageWithMeta = {
        ...lastUserMsg,
        metadata: {
          createdAt: Date.now(),
          model: modelAndProvider,
        },
      }
      await store.appendUserMessage(id, userMessageWithMeta)
    }
  }

  // Use Date.now() as message creation timestamp (millisecond Unix time)
  const messageStartTime = Date.now()
  // Use performance.now() to calculate duration (higher precision)
  const perfStartTime = performance.now()

  return {
    agent,
    modelMessages,
    store,
    sessionGoal,
    id,
    modelAndProvider,
    space: space ?? "",
    createdAt,
    existingMeta,
    messages,
    aiConfig,
    startTime: messageStartTime,
    perfStartTime,
  }
}

export async function handleAgentApi(
  data: IAgentData,
  ctx?: AgentContextOptions
) {
  const log = ctx?.logger ?? console

  const prepared = await prepareAgent(data, ctx)
  const {
    agent,
    modelMessages,
    store,
    sessionGoal,
    id,
    modelAndProvider,
    space,
    createdAt,
    existingMeta,
    messages,
    startTime,
    perfStartTime,
  } = prepared

  log.info("[agent] ▶ creating UI message stream")

  // Track how many parts have been written per messageId to avoid duplicates.
  // onStepFinish provides accumulated parts (all steps so far), not just the new ones.
  const writtenParts = new Map<string, number>()
  const signal = ctx?.signal

  // Used to store usage data from agent.stream
  let streamUsage: LanguageModelUsage | undefined

  let result: StreamTextResult<ToolSet, never> | undefined = undefined

  const uiStream = createUIMessageStream<MessageWithMeta>({
    execute: async ({ writer }) => {
      // Send initial metadata (createdAt, model)
      writer.write({
        type: "message-metadata",
        messageMetadata: {
          createdAt: startTime,
          model: modelAndProvider,
        } as MessageMetadata,
      })

      result = await agent.stream({
        abortSignal: signal,
        experimental_transform: smoothStream({ delayInMs: 20 }),
        messages: modelMessages as any,
      })
      const stream = result.toUIMessageStream({ originalMessages: messages })
      let firstChunk = true
      for await (const chunk of stream) {
        if (firstChunk) {
          log.info(
            `[agent] ⏱️ time to first chunk: ${(
              performance.now() - perfStartTime
            ).toFixed(2)}ms`
          )
          firstChunk = false
        }
        writer.write(chunk)
      }

      try {
        streamUsage = await result.usage
      } catch (e) {
        log.error("[agent] failed to get token usage in execute:", e)
      }

      // Send final metadata (including duration and tokens)
      const finalMetadata: MessageMetadata = {
        createdAt: startTime,
        model: modelAndProvider,
        duration: Math.round(performance.now() - perfStartTime),
        tokens: streamUsage,
      }
      writer.write({
        type: "message-metadata",
        messageMetadata: finalMetadata,
      })
    },
    originalMessages: messages,
    onStepFinish: async ({ responseMessage }) => {
      if (!store) return
      const msgId = responseMessage.id
      const prevCount = writtenParts.get(msgId) ?? 0
      const newParts = responseMessage.parts.slice(prevCount)
      if (newParts.length === 0) return
      writtenParts.set(msgId, responseMessage.parts.length)
      log.info("[agent] ▶ onStepFinish — appending new parts", {
        id,
        newCount: newParts.length,
        totalCount: responseMessage.parts.length,
      })
      try {
        // Build metadata (basic info, will be updated with complete info in onFinish)
        const metadata: MessageMetadata = {
          createdAt: startTime,
          model: modelAndProvider,
        }
        await store.appendStepMessage(id, msgId, newParts, metadata)
      } catch (err) {
        log.error("[agent] ✖ onStepFinish error", {
          id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
    onFinish: async ({ responseMessage, isAborted }) => {
      if (!store) return
      log.info("[agent] ▶ onFinish — saving", {
        id,
        isAborted,
        partCount: responseMessage.parts.length,
      })
      try {
        const msgId = responseMessage.id

        // Flush any parts that onStepFinish didn't persist (e.g. mid-step abort)
        const prevCount = writtenParts.get(msgId) ?? 0
        const remaining = responseMessage.parts.slice(prevCount)
        if (remaining.length > 0) {
          await store.appendStepMessage(id, msgId, remaining)
        }

        // Build final metadata containing usage and duration, and append metadata-update event
        let finalUsage = streamUsage
        try {
          if (result) {
            finalUsage = await result.usage
          }
        } catch (e) {
          log.error("[agent] failed to get token usage in onFinish:", e)
        }

        const metadata: MessageMetadata = {
          createdAt: startTime,
          model: modelAndProvider,
          duration: Math.round(performance.now() - perfStartTime),
          tokens: finalUsage,
        }
        await store.updateMessageMetadata(id, msgId, metadata)

        // Persist step parts and preserve existing permissions
        const savedMeta = await store.loadMeta(id)
        await store.saveMeta(id, {
          id,
          goal: sessionGoal,
          model: modelAndProvider,
          space: space ?? "",
          createdAt,
          completedAt: new Date().toISOString(),
          parentId: savedMeta?.parentId,
          forkedMessageId: savedMeta?.forkedMessageId,
          permissions: savedMeta?.permissions,
        })
      } catch (err) {
        log.error("[agent] ✖ onFinish error", {
          id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
    onError: (err: unknown) => {
      log.error("[agent] ✖ stream execution error", {
        id,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      })
      return err instanceof Error ? err.message : String(err)
    },
  })

  const response = createUIMessageStreamResponse({ stream: uiStream })
  log.info(
    `[agent] ⏱️ time to response: ${(performance.now() - startTime).toFixed(
      2
    )}ms`
  )
  return response
}
