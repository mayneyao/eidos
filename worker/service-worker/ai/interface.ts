import type { Message } from "ai"

export interface IData {
  messages: Message[]
  // body
  type: string | "google" | "openai"
  apiKey: string
  baseUrl: string
  systemPrompt: string
  model: string
  modelId: string
  id: string // chat id
  space: string // dataspace name
  projectId?: string
}
