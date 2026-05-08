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
import { createBashTool, createWebSearchTool, serverTools } from "../tools"
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
}

/**
 * Resolve LLM provider credentials from the AI config using the model string.
 * Model format: "modelId@providerName" (e.g. "gpt-4o@openai")
 */
function resolveProviderFromConfig(
  modelAndProvider: string,
  aiConfig: AIFormValues | undefined
) {
  const parts = modelAndProvider.split("@")
  const modelId = parts[0]
  const providerName = parts[1]

  if (!aiConfig || !providerName) {
    return { modelId, provider: getProvider({}) }
  }

  const llmProvider = aiConfig.llmProviders.find(
    (p) => p.name === providerName && p.enabled !== false
  )

  if (!llmProvider) {
    return { modelId, provider: getProvider({}) }
  }

  return {
    modelId,
    provider: getProvider({
      apiKey: llmProvider.apiKey,
      baseUrl: llmProvider.baseUrl,
      type: llmProvider.type,
    }),
  }
}

export async function handleAgentApi(
  data: IAgentData,
  ctx?: {
    getDataspace: (space: string) => Promise<DataSpace | null>
    getSpaceInfo?: (space: string) => { path: string } | null
    signal?: AbortSignal
    getAIConfig?: () => AIFormValues | undefined
  }
) {
  const {
    goal,
    messages,
    systemPrompt,
    model: modelAndProvider,
    space,
    id,
    tools,
    maxSteps = 100,
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

  const { modelId, provider } = resolveProviderFromConfig(
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
  // const dsTools = dataspace ? createTableTools(dataspace) : {}
  const spaceInfo = space && ctx?.getSpaceInfo ? ctx.getSpaceInfo(space) : null
  const bashWithDs =
    dataspace && spaceInfo
      ? { bash: createBashTool({ dataspace, spaceInfo }) }
      : {}
  // const mergedTools = { ...serverTools, ...bashWithDs, ...dsTools, ...(tools ?? {}) }
  const mergedTools = {
    ...serverTools,
    webSearch: createWebSearchTool(aiConfig?.exaApiKey),
    ...bashWithDs,
    ...(tools ?? {}),
  }

  const agentCtx = AgentContext.create({
    goal,
    tools: Object.keys(mergedTools),
    systemPrompt,
  })

  console.log("[agent] ▶ tools merged", {
    serverTools: Object.keys(serverTools),
    // dsTools: Object.keys(dsTools),
    clientTools: Object.keys(tools ?? {}),
    total: Object.keys(mergedTools).length,
  })

  const agent = new ToolLoopAgent({
    model: wrapLanguageModel({
      model: llmodel,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    }),
    instructions: agentCtx.buildInstructions(),
    tools: mergedTools as Record<string, any>,
    stopWhen: stepCountIs(maxSteps),
  })

  // convertToModelMessages handles all UIMessage parts (tool-call, tool-result,
  // reasoning, etc.) correctly — this is the official SDK conversion path.
  //
  // Sanitize messages first: an aborted stream may leave tool invocations in
  // an incomplete state (e.g. input-streaming / input-available without output).
  // convertToModelMessages rejects these, so strip them before conversion.
  const sanitized = messages.map((msg) => {
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

  const modelMessages = await convertToModelMessages(
    agentCtx.buildMessages(sanitized)
  )

  const store = dataspace ? new AgentSessionStore(dataspace) : null

  // Write initial meta.json (status: executing)
  const createdAt = new Date().toISOString()
  if (store) {
    await store.saveMeta(id, {
      id,
      goal,
      status: "executing",
      model: modelAndProvider,
      space: space ?? "",
      createdAt,
      maxSteps,
    })
    // Persist the latest user message so it's not lost if the stream crashes
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMsg) await store.appendUserMessage(id, lastUserMsg)
  }

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
      for await (const chunk of stream) {
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
          goal,
          status,
          model: modelAndProvider,
          space: space ?? "",
          createdAt,
          completedAt: new Date().toISOString(),
          maxSteps,
        })
      } catch (err) {
        console.error("[agent] ✖ onFinish error", {
          id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  })

  return createUIMessageStreamResponse({ stream: uiStream })
}
