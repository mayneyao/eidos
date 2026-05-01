import { uuidv7 } from "@/lib/utils"
import type { AgentSession } from "@/packages/core/agent-session/agent-session-store"
import { AgentSessionStore } from "@/packages/core/agent-session/agent-session-store"
import type { DataSpace } from "@/packages/core/data-space"
import {
  ToolLoopAgent,
  extractReasoningMiddleware,
  smoothStream,
  stepCountIs,
  wrapLanguageModel,
} from "ai"
import { getProvider } from "../helper"
import { extractText } from "./utils"

export interface IAgentMessage {
  id?: string
  role: string
  content: string
  parts?: unknown[]
}

export interface IAgentData {
  goal: string
  messages: IAgentMessage[]
  previousMessages?: IAgentMessage[]
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
    messages: clientMessages,
    apiKey,
    baseUrl,
    systemPrompt,
    model: modelAndProvider,
    space,
    id,
    tools,
    maxSteps = 10,
  } = data

  const provider = getProvider({ apiKey, baseUrl, type: data.type })
  const modelId = modelAndProvider.split("@")[0]
  const llmodel = provider(modelId)
  const dataspace = space ? await ctx?.getDataspace(space) : null
  const agentPrompt =
    systemPrompt || buildAgentSystemPrompt(goal, Object.keys(tools ?? {}))

  const allClientMessages = clientMessages

  const agent = new ToolLoopAgent({
    model: wrapLanguageModel({
      model: llmodel,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    }),
    instructions: agentPrompt,
    tools: (tools ?? {}) as Record<string, any>,
    stopWhen: stepCountIs(maxSteps),
    onFinish: async ({ steps }) => {
      if (!dataspace || !id) return

      const allMessages: AgentSession["messages"] = allClientMessages.map(
        (m) => ({
          id: m.id ?? uuidv7(),
          role: m.role as string,
          parts: ((m as any).parts ?? []) as any,
        })
      )

      for (const step of steps) {
        if (step.text) {
          allMessages.push({
            id: uuidv7(),
            role: "assistant",
            parts: [{ type: "text", text: step.text }],
          })
        }
        for (const tc of step.toolCalls ?? []) {
          const t = tc as any
          allMessages.push({
            id: uuidv7(),
            role: "assistant",
            parts: [
              {
                type: "tool-call",
                toolCallId: t.toolCallId,
                toolName: t.toolName,
                args: t.args ?? t.input,
              },
            ],
          })
        }
        for (const tr of step.toolResults ?? []) {
          const r = tr as any
          allMessages.push({
            id: uuidv7(),
            role: "tool",
            parts: [
              {
                type: "tool-result",
                toolCallId: r.toolCallId,
                toolName: r.toolName,
                output: r.result ?? r.output,
                state: "result",
              },
            ],
          })
        }
      }

      const store = new AgentSessionStore(dataspace)
      const existing = await store.load(id)

      const session: AgentSession = {
        id,
        goal: existing?.goal ?? goal,
        status: "completed",
        planSteps: [],
        messages: allMessages,
        model: modelAndProvider,
        space: space ?? "",
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        maxSteps,
      }

      await store.save(session)
    },
  })

  const result = await agent.stream({
    experimental_transform: smoothStream({ delayInMs: 20 }),
    messages: allClientMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: extractText((m as any).parts),
    })),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: clientMessages.map((m) => ({
      id: m.id ?? uuidv7(),
      role: m.role as "user" | "assistant" | "system",
      content: extractText((m as any).parts),
      parts: ((m as any).parts ?? []) as any,
    })) as any,
  })
}
