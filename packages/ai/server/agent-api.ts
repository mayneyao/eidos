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
import { createBashTool, createFileTools } from "../tools"
import { AgentContext } from "./agent-context"
import { buildProviderOptions, resolveProviderForModel } from "./model"
import type { PermissionServerLike } from "../permission"

/** UIMessage type with metadata */
type MessageWithMeta = UIMessage<MessageMetadata>

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
  let bash: any = null
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

    const { tool: bashTool, bash: b } = createBashTool({
      skillsDir,
      sessionsDir,
      vfsDir,
      dataspace,
      env: secrets,
      extraInstructions: agentCtx.skillInstructions ?? undefined,
      exaApiKey: aiConfig?.exaApiKey,
      permissionServer: ctx?.permissionServer,
      sessionId: id,
    })

    bash = b
    bashWithDs = { bash: bashTool }
    fsTools = createFileTools(
      b,
      ctx?.permissionServer
        ? { permissionServer: ctx.permissionServer, sessionId: id }
        : undefined
    )
  }

  const mergedTools: Record<string, any> = {
    ...fsTools,
    ...bashWithDs,
    ...(agentCtx.skillTool ?? {}),
    ...(tools ?? {}),
  }

  log.info("[agent] ▶ tools merged", {
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
