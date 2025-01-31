import { LLMProvider } from "@/apps/web-app/settings/ai/store"
import type { Message } from "ai"

export interface IData {
  messages: Message[]
  // body
  apiKey: string
  baseUrl: string
  systemPrompt: string
  model: string
  modelId: string
  id: string // chat id
  space: string // dataspace name
  projectId?: string
  useTools?: boolean
  type?: LLMProvider['type']
  textModel?: {
    baseUrl: string;
    apiKey: string;
    modelId: string;
    type?: undefined;
  }
}
