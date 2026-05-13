import { AgentSessionStore } from "@/packages/core/agent-session/agent-session-store"
import type { DataSpace } from "@/packages/core/data-space"
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
import type { UIMessage } from "ai"
import type { AIFormValues } from "../config"
import { getProvider } from "../helper"
import {
  buildAgentFs,
  createBashTool,
  createFileTools,
  createWebSearchTool,
  serverTools,
} from "../tools"
import { AgentContext } from "./agent-context"

export interface IAgentData {
  goal: string
  /** UIMessage[] from useChat — the source of truth for the conversation */
  messages: UIMessage[]
  systemPrompt?: string
  /** Model identifier in "modelId@providerName" format */
  model: string
  space?: string
  id: string
  tools?: Record<string, unknown>
  maxSteps?: number
  thinking?: "off" | "low" | "medium" | "high"
  skills?: string[]
}

export type ThinkingLevel = NonNullable<IAgentData["thinking"]>

/**
 * Resolve LLM provider credentials from the AI config using the model string.
 * Model format: "modelId@providerName" (e.g. "gpt-4o@openai")
 */
function buildProviderOptions(
  providerType: string | undefined,
  thinking: ThinkingLevel
): Record<string, any> | undefined {
  if (thinking === "off") return undefined
  switch (providerType) {
    case "anthropic":
      return { anthropic: { thinking: { type: "enabled" }, effort: thinking } }
    case "openai":
      return { openai: { reasoningEffort: thinking } }
    default:
      return undefined
  }
}

function resolveProviderFromConfig(
  modelAndProvider: string,
  aiConfig: AIFormValues | undefined
) {
  const parts = modelAndProvider.split("@")
  const modelId = parts[0]
  const providerName = parts[1]

  if (!aiConfig || !providerName) {
    return { modelId, provider: getProvider({}), providerType: undefined }
  }

  const llmProvider = aiConfig.llmProviders.find(
    (p) => p.name === providerName && p.enabled !== false
  )

  if (!llmProvider) {
    return { modelId, provider: getProvider({}), providerType: undefined }
  }

  return {
    modelId,
    provider: getProvider({
      apiKey: llmProvider.apiKey,
      baseUrl: llmProvider.baseUrl,
      type: llmProvider.type,
      apiVersion: llmProvider.apiVersion,
      name: llmProvider.name,
    }),
    providerType: llmProvider.type,
  }
}

/**
 * Sanitize messages: an aborted stream may leave tool invocations in
 * an incomplete state (e.g. input-streaming / input-available without output).
 * convertToModelMessages rejects these, so strip them before conversion.
 */
function sanitizeMessages(messages: UIMessage[]): UIMessage[] {
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
  maxSteps: number
  createdAt: string
  existingMeta: any
  messages: UIMessage[]
  aiConfig: AIFormValues | undefined
}

export interface AgentContextOptions {
  getDataspace: (space: string) => Promise<DataSpace | null>
  signal?: AbortSignal
  getAIConfig?: () => AIFormValues | undefined
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
    maxSteps = 100,
    thinking,
    skills,
  } = data

  const aiConfig = ctx?.getAIConfig?.()

  console.log("[agent] ▶ start", {
    id,
    goal: goal.slice(0, 80),
    model: modelAndProvider,
    space,
    messageCount: messages.length,
    toolCount: Object.keys(tools ?? {}).length,
    maxSteps,
  })

  const { modelId, provider, providerType } = resolveProviderFromConfig(
    modelAndProvider,
    aiConfig
  )
  const llmodel = provider(modelId)
  const dataspace = space ? await ctx?.getDataspace(space) : null
  console.log("[agent] ▶ dataspace resolved", {
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
  })

  // Build shared filesystem and tools (bash + read/write/edit)
  let fsTools: Record<string, any> = {}
  let bashWithDs: Record<string, any> = {}
  if (dataspace) {
    const fs = await buildAgentFs({ dataspace })
    bashWithDs = {
      bash: createBashTool(
        fs,
        agentCtx.skillInstructions ?? undefined,
        dataspace
      ),
    }
    fsTools = createFileTools(fs)
  }

  const mergedTools = {
    ...serverTools,
    "web-search": createWebSearchTool(aiConfig?.exaApiKey),
    ...fsTools,
    ...bashWithDs,
    ...(agentCtx.skillTool ?? {}),
    ...(tools ?? {}),
  }

  console.log("[agent] ▶ tools merged", {
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
    stopWhen: stepCountIs(maxSteps),
    ...(providerOptions ? { providerOptions } : {}),
  })

  const modelMessages = await convertToModelMessages(
    agentCtx.buildMessages(sanitizeMessages(messages))
  )

  // Write initial meta.json (status: executing)
  const createdAt = existingMeta?.createdAt || new Date().toISOString()
  if (store) {
    await store.saveMeta(id, {
      id,
      goal: sessionGoal,
      status: "executing",
      model: modelAndProvider,
      space: space ?? "",
      createdAt,
      maxSteps,
      parentId: existingMeta?.parentId,
      forkedMessageId: existingMeta?.forkedMessageId,
    })
    // Persist the latest user message so it's not lost if the stream crashes
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMsg) await store.appendUserMessage(id, lastUserMsg)
  }

  return {
    agent,
    modelMessages,
    store,
    sessionGoal,
    id,
    modelAndProvider,
    space: space ?? "",
    maxSteps,
    createdAt,
    existingMeta,
    messages,
    aiConfig,
  }
}

export async function handleAgentApi(
  data: IAgentData,
  ctx?: AgentContextOptions
) {
  const startTime = performance.now()

  const prepared = await prepareAgent(data, ctx)
  const {
    agent,
    modelMessages,
    store,
    sessionGoal,
    id,
    modelAndProvider,
    space,
    maxSteps,
    createdAt,
    existingMeta,
    messages,
  } = prepared

  console.log("[agent] ▶ creating UI message stream")

  // Track how many parts have been written per messageId to avoid duplicates.
  // onStepFinish provides accumulated parts (all steps so far), not just the new ones.
  const writtenParts = new Map<string, number>()

  const signal = ctx?.signal

  const uiStream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = await agent.stream({
        abortSignal: signal,
        experimental_transform: smoothStream({ delayInMs: 20 }),
        messages: modelMessages as any,
      })
      const stream = result.toUIMessageStream({ originalMessages: messages })
      let firstChunk = true
      for await (const chunk of stream) {
        if (firstChunk) {
          console.log(
            `[agent] ⏱️ time to first chunk: ${(
              performance.now() - startTime
            ).toFixed(2)}ms`
          )
          firstChunk = false
        }
        writer.write(chunk)
      }
    },
    originalMessages: messages,
    onStepFinish: async ({ responseMessage }) => {
      if (!store) return
      const msgId = responseMessage.id
      const prevCount = writtenParts.get(msgId) ?? 0
      const newParts = responseMessage.parts.slice(prevCount)
      if (newParts.length === 0) return
      writtenParts.set(msgId, responseMessage.parts.length)
      console.log("[agent] ▶ onStepFinish — appending new parts", {
        id,
        newCount: newParts.length,
        totalCount: responseMessage.parts.length,
      })
      try {
        await store.appendStepMessage(id, msgId, newParts)
      } catch (err) {
        console.error("[agent] ✖ onStepFinish error", {
          id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
    onFinish: async ({ responseMessage, isAborted }) => {
      if (!store) return
      const status = isAborted ? "stopped" : "completed"
      console.log("[agent] ▶ onFinish — saving", {
        id,
        status,
        partCount: responseMessage.parts.length,
      })
      try {
        // Flush any parts that onStepFinish didn't persist (e.g. mid-step abort)
        const msgId = responseMessage.id
        const prevCount = writtenParts.get(msgId) ?? 0
        const remaining = responseMessage.parts.slice(prevCount)
        if (remaining.length > 0) {
          await store.appendStepMessage(id, msgId, remaining)
        }
        await store.saveMeta(id, {
          id,
          goal: sessionGoal,
          status,
          model: modelAndProvider,
          space: space ?? "",
          createdAt,
          completedAt: new Date().toISOString(),
          maxSteps,
          parentId: existingMeta?.parentId,
          forkedMessageId: existingMeta?.forkedMessageId,
        })
      } catch (err) {
        console.error("[agent] ✖ onFinish error", {
          id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  })

  const response = createUIMessageStreamResponse({ stream: uiStream })
  console.log(
    `[agent] ⏱️ time to response: ${(performance.now() - startTime).toFixed(
      2
    )}ms`
  )
  return response
}
