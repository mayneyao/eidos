import { getProvider } from "@/packages/ai/helper"
import {
  extractReasoningMiddleware,
  smoothStream,
  stepCountIs,
  streamText,
  wrapLanguageModel,
} from "@/packages/ai/index"
import { uuidv7 } from "@/lib/utils"
import type { DataSpace } from "@/packages/core/data-space"
import { AgentSessionStore } from "@/packages/core/agent-session/agent-session-store"
import type { IAgentData } from "./interface"

function extractText(parts: unknown[] | undefined): string {
  if (!parts) return ""
  return parts
    .filter((p: any) => p?.type === "text")
    .map((p: any) => p.text ?? "")
    .join("")
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
  ctx?: {
    getDataspace: (space: string) => Promise<DataSpace | null>
  }
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

  const provider = getProvider({
    apiKey,
    baseUrl,
    type: data.type,
  })

  const modelId = modelAndProvider.split("@")[0]
  const llmodel = provider(modelId)

  const dataspace = space ? await ctx?.getDataspace(space) : null

  const agentPrompt =
    systemPrompt || buildAgentSystemPrompt(goal, Object.keys(tools ?? {}))

  const result = streamText({
    model: wrapLanguageModel({
      model: llmodel,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    }),
    system: agentPrompt,
    experimental_transform: smoothStream({ delayInMs: 20 }),
    messages: clientMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: extractText((m as any).parts),
    })),
    tools: (tools ?? {}) as Record<string, any>,
    stopWhen: stepCountIs(maxSteps),
    onFinish: async ({ steps }) => {
      if (dataspace) {
        try {
          const store = new AgentSessionStore(dataspace)
          await store.save({
            id,
            goal,
            status: "completed",
            planSteps:
              steps?.map((s: any, i: number) => ({
                id: `${id}-step-${i}`,
                description: s.text ?? "",
                status: "completed" as const,
                toolName: s.toolCalls?.[0]?.toolName,
              })) ?? [],
            messages: clientMessages.map((m) => ({
              id: m.id ?? uuidv7(),
              role: m.role,
              content: extractText((m as any).parts),
            })),
            model: modelAndProvider,
            space: space ?? "",
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            maxSteps,
          })
        } catch (e) {
          console.error("Failed to save agent session:", e)
        }
      }
    },
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
