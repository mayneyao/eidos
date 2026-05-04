import type { AgentSession } from "@/packages/core/agent-session/agent-session-store"
import { AgentSessionStore } from "@/packages/core/agent-session/agent-session-store"
import type { DataSpace } from "@/packages/core/data-space"
import {
  ToolLoopAgent,
  convertToModelMessages,
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

  console.log("[agent] ▶ calling agent.stream()")
  const result = await agent.stream({
    experimental_transform: smoothStream({ delayInMs: 20 }),
    messages: modelMessages as any,
  })
  console.log("[agent] ▶ stream created, returning response")

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages }) => {
      if (!dataspace || !id) return

      console.log("[agent] ▶ onFinish — saving session", {
        id,
        messageCount: finalMessages.length,
      })

      try {
        const store = new AgentSessionStore(dataspace)
        const existing = await store.load(id)

        const session: AgentSession = {
          id,
          goal: existing?.goal ?? goal,
          status: "completed",
          planSteps: [],
          // finalMessages is UIMessage[] — the canonical format recommended by AI SDK
          messages: finalMessages,
          model: modelAndProvider,
          space: space ?? "",
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          completedAt: new Date().toISOString(),
          maxSteps,
        }

        await store.save(session)
        console.log("[agent] ▶ session saved", {
          id,
          messageCount: finalMessages.length,
        })
      } catch (err) {
        console.error("[agent] ✖ onFinish error", {
          id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  })
}
