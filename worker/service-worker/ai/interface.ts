import type { Message } from "ai"

export interface IData {
  messages: Message[]
  // body
  type: string | "google" | "openai" | "dify2openai"
  apiKey: string
  baseUrl: string
  systemPrompt: string
  model: string
  modelId: string
  paths: string
  space: string
}
