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
  type?: 'openai' | 'deepseek' | 'openai-compatible' | string
  textModel?: {
    baseUrl: string;
    apiKey: string;
    modelId: string;
    type?: undefined;
  }
}
