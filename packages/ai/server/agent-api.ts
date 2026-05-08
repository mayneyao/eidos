import { AgentSessionStore } from "@/packages/core/agent-session/agent-session-store"
import type { DataSpace } from "@/packages/core/data-space"
import {
  ToolLoopAgent,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  extractReasoningMiddleware,
  smoothStream,
  stepCountIs,
  wrapLanguageModel,
} from "ai"
import type { UIMessage } from "ai"
import { getProvider } from "../helper"
import { createBashTool, serverTools } from "../tools"
import { AgentContext } from "./agent-context"

export interface IAgentData {
  goal: string
  /** UIMessage[] from useChat — the source of truth for the conversation */
  messages: UIMessage[]
  apiKey?: string
  baseUrl?: string
  systemPrompt?: string
  model: string
  type?: any
  space?: string
  id: string
  tools?: Record<string, unknown>
  maxSteps?: number
}

export async function handleAgentApi(
  data: IAgentData,
  ctx?: {
    getDataspace: (space: string) => Promise<DataSpace | null>
    getSpaceInfo?: (space: string) => { path: string } | null
    signal?: AbortSignal
  }
) {
  const {
    goal,
    messages,
    apiKey,
    baseUrl,
    systemPrompt,
    model: modelAndProvider,
    space,
    id,
    tools,
    maxSteps = 100,
  } = data

  console.log("[agent] ▶ start", {
    id,
    goal: goal.slice(0, 80),
    model: modelAndProvider,
    space,
    messageCount: messages.length,
    toolCount: Object.keys(tools ?? {}).length,
    maxSteps,
  })

  const provider = getProvider({ apiKey, baseUrl, type: data.type })
  const modelId = modelAndProvider.split("@")[0]
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
  const mergedTools = { ...serverTools, ...bashWithDs, ...(tools ?? {}) }

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
  const modelMessages = await convertToModelMessages(
    agentCtx.buildMessages(messages)
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
    onFinish: async ({ isAborted }) => {
      if (!store) return
      const status = isAborted ? "stopped" : "completed"
      console.log("[agent] ▶ onFinish — saving meta", {
        id,
        status,
      })
      try {
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
