import { OpenAIStream, StreamingTextResponse } from "ai"
import OpenAI from "openai"

import { functions } from "@/lib/ai/functions"

export const pathname = "/api/chat"
export default async function handle(event: FetchEvent) {
  const req = await event.request.json()
  const { messages, token, baseUrl, systemPrompt } = req
  const openai = new OpenAI({
    apiKey: token,
    baseURL: baseUrl,
  })
  const sysPrompt = {
    role: "system" as const,
    content: systemPrompt,
  }
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-0613",
    stream: true,
    messages: [...messages, sysPrompt],
    max_tokens: 2048,
    functions,
  })
  const stream = OpenAIStream(response)
  return new StreamingTextResponse(stream)
}
