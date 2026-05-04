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

function buildAgentSystemPrompt(goal: string, tools: string[]): string {
  return `You are an autonomous AI agent running in the Eidos data workspace.
Your goal is: ${goal}

Available tools: ${tools.join(", ")}

Instructions:
1. First, analyze the goal and plan your approach silently.
2. Execute the plan step-by-step using the available tools.
3. After each tool call, evaluate the result and decide the next action.
4. When the goal is fully achieved, provide a clear **Summary** of what was done.
5. If you encounter errors, try an alternative approach.

Be proactive. Don't ask for confirmation — just execute the plan.`
}

export async function handleAgentApi(
  data: IAgentData,
  ctx?: { getDataspace: (space: string) => Promise<DataSpace | null> }
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
  const bashWithDs = dataspace ? { bash: createBashTool(dataspace) } : {}
  // const mergedTools = { ...serverTools, ...bashWithDs, ...dsTools, ...(tools ?? {}) }
  const mergedTools = { ...serverTools, ...bashWithDs, ...(tools ?? {}) }
  const agentPrompt =
    systemPrompt || buildAgentSystemPrompt(goal, Object.keys(mergedTools))

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
    instructions: agentPrompt,
    tools: mergedTools as Record<string, any>,
    stopWhen: stepCountIs(maxSteps),
  })

  // convertToModelMessages handles all UIMessage parts (tool-call, tool-result,
  // reasoning, etc.) correctly — this is the official SDK conversion path.
  const modelMessages = await convertToModelMessages(messages)

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

  const uiStream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = await agent.stream({
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
    onFinish: async ({ messages: finalMessages }) => {
      if (!store) return
      console.log("[agent] ▶ onFinish — saving meta", {
        id,
        messageCount: finalMessages.length,
      })
      try {
        await store.saveMeta(id, {
          id,
          goal,
          status: "completed",
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
