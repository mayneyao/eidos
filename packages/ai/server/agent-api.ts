import fs from "node:fs"
import os from "node:os"
import path from "node:path"
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
  createBashTool,
  createFileTools,
  createWebSearchTool,
  serverTools,
} from "../tools"
import { AgentContext } from "./agent-context"
import { buildProviderOptions, resolveProviderForModel } from "./model"
import { withPermission, type PermissionServerLike } from "../permission"

/** UIMessage type with metadata */
type MessageWithMeta = UIMessage<MessageMetadata>

/**
 * Lightweight bash script parser: extracts command names from
 * pipelines, separators, and subshells without a full AST.
 */
function extractCommandNames(
  script: string
): Array<{ name: string; fullArgs: string }> {
  const commands: Array<{ name: string; fullArgs: string }> = []

  // Strip comments
  const noComments = script
    .split("\n")
    .map((l) => l.replace(/(?<!\$)#.*$/, ""))
    .join("\n")

  // Split by major separators: |, &&, ||, ;, &, newline
  const segments = noComments
    .split(/\s*(?:\|\||&&|;|&|\||\n)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const segment of segments) {
    const words = segment.split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) continue

    const first = words[0] ?? ""

    // Skip variable assignments and redirect-only segments
    if (first.includes("=") && !first.startsWith("$")) continue
    if (
      first.startsWith(">") ||
      first.startsWith("<") ||
      first.startsWith("2>")
    )
      continue

    // Skip shell keywords
    const shellKeywords = new Set([
      "if",
      "then",
      "else",
      "elif",
      "fi",
      "for",
      "while",
      "until",
      "do",
      "done",
      "case",
      "esac",
      "in",
      "function",
      "{",
      "}",
      "(",
      ")",
      "[[",
      "]]",
    ])
    if (shellKeywords.has(first)) continue

    // Skip assignments like VAR=value
    if (/^\w+=/.test(segment)) continue

    commands.push({
      name: first,
      fullArgs: words.join(" "),
    })
  }

  return commands
}

/** Check if an eidos invocation involves write operations. */
function isEidosWrite(fullArgs: string): boolean {
  return (
    /record\s+(insert|update|delete)\b/.test(fullArgs) ||
    /table\s+(create|delete)\b/.test(fullArgs) ||
    /column\s+(create|delete|update)\b/.test(fullArgs) ||
    /view\s+(create|delete|update)\b/.test(fullArgs) ||
    /journal\s+write\b/.test(fullArgs) ||
    /extension\s+(create|write)\b/.test(fullArgs) ||
    /doc\s+(create|update|delete)\b/.test(fullArgs) ||
    /subdoc\s+(write|delete)\b/.test(fullArgs)
  )
}

export interface IAgentData {
  goal: string
  messages: MessageWithMeta[]
  systemPrompt?: string
  model: string
  space?: string
  id: string
  tools?: Record<string, unknown>
  thinking?: "off" | "low" | "medium" | "high"
  skills?: string[]
  mentions?: Array<{ id: string; name: string; type: string }>
}

export type ThinkingLevel = NonNullable<IAgentData["thinking"]>

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
  startTime: number
  perfStartTime: number
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
  })
  const store = dataspace ? new AgentSessionStore(dataspace) : null
  const existingMeta = store ? await store.loadMeta(id) : null
  const sessionGoal = existingMeta?.goal || goal

  const agentCtx = await AgentContext.create({
    goal: sessionGoal,
    tools: [],
    systemPrompt,
    skills,
    mentions: data.mentions,
    logger: ctx?.logger,
  })

  let fsTools: Record<string, any> = {}
  let bashWithDs: Record<string, any> = {}
  if (dataspace) {
    const spacePath = space ? ctx?.getSpacePath?.(space) : undefined
    const skillsDir = path.join(os.homedir(), ".agents", "skills")
    const sessionsDir = spacePath
      ? path.join(spacePath, ".eidos", "agent", "sessions")
      : path.join(os.homedir(), ".eidos", "agent", "sessions")
    const vfsDir = spacePath
      ? path.join(spacePath, ".eidos", "agent", "vfs", id)
      : path.join(os.homedir(), ".eidos", "agent", "vfs", id)

    // Ensure mount directories exist
    for (const dir of [skillsDir, sessionsDir, vfsDir]) {
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }

    const secrets = ctx?.getSecrets ? await ctx.getSecrets() : {}

    const { tool: bashTool, bash } = createBashTool({
      skillsDir,
      sessionsDir,
      vfsDir,
      dataspace,
      env: secrets,
      extraInstructions: agentCtx.skillInstructions ?? undefined,
    })

    bashWithDs = { bash: bashTool }
    fsTools = createFileTools(bash)
  }

  const mergedTools: Record<string, any> = {
    ...serverTools,
    "web-search": createWebSearchTool(aiConfig?.exaApiKey),
    ...fsTools,
    ...bashWithDs,
    ...(agentCtx.skillTool ?? {}),
    ...(tools ?? {}),
  }

  // Permission wrapping for write/edit/bash tools
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

          // Check for redirect or pipe to protected mount paths
          const mountPattern = /(?:>|>>)\s*['"]?\/(?:agent)\//
          const teeToPath = /\btee\s+['"]?\/(?:agent)\//
          if (mountPattern.test(cmd) || teeToPath.test(cmd)) {
            return "bash:redirect"
          }

          // Commands that are always read-only
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
            "jq",
            "awk",
            "sed",
            "sleep",
            "which",
            "file",
            "stat",
            "basename",
            "dirname",
            "true",
            "false",
            "clear",
            "date",
            "hostname",
            "whoami",
            "uname",
            "help",
            "history",
          ])

          // Extract ALL command names from the script (across pipes, separators)
          const commands = extractCommandNames(cmd)
          let firstDangerous = ""

          for (const { name, fullArgs } of commands) {
            if (safeCommands.has(name)) continue

            if (name === "eidos") {
              if (isEidosWrite(fullArgs)) {
                firstDangerous = `bash:eidos write`
                break
              }
              continue
            }

            // Extract subcommand prefix for cache key
            const parts = fullArgs.split(/\s+/)
            const subs: string[] = []
            for (let i = 1; i < parts.length && subs.length < 2; i++) {
              const p = parts[i]
              if (p?.startsWith("-") || p?.startsWith("{") || /^["']/.test(p))
                break
              subs.push(p)
            }
            firstDangerous =
              subs.length > 0
                ? `bash:${name} ${subs.join(" ")}`
                : `bash:${name}`
            break
          }

          return firstDangerous || false
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
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMsg) {
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

  const messageStartTime = Date.now()
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

  const writtenParts = new Map<string, number>()
  const signal = ctx?.signal

  let streamUsage: LanguageModelUsage | undefined

  let result: StreamTextResult<ToolSet, never> | undefined = undefined

  const uiStream = createUIMessageStream<MessageWithMeta>({
    execute: async ({ writer }) => {
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

        const prevCount = writtenParts.get(msgId) ?? 0
        const remaining = responseMessage.parts.slice(prevCount)
        if (remaining.length > 0) {
          await store.appendStepMessage(id, msgId, remaining)
        }

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
