import type { LLMProvider } from "@/packages/ai/config"
import type { Tool, UIMessage } from "ai"

export interface IData {
  message: UIMessage
  messages: UIMessage[]
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
  chunking?: 'word' | 'line' | RegExp;
  tools?: Record<string, Tool>;
}
