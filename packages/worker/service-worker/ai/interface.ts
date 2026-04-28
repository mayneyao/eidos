import type { LLMProviderType } from "@/packages/ai/helper"

export interface IAgentMessage {
  id?: string
  role: string
  content: string
  parts?: unknown[]
}

export interface IAgentData {
  goal: string
  messages: IAgentMessage[]
  apiKey?: string
  baseUrl?: string
  systemPrompt?: string
  model: string
  type?: LLMProviderType
  space?: string
  id: string
  tools?: Record<string, unknown>
  maxSteps?: number
}
