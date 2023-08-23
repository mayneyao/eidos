import { OpenAIStream, StreamingTextResponse } from "ai"
import OpenAI from "openai"

import { functions } from "@/lib/ai/functions"
import { workerEnv } from "@/lib/env"

const getOpenAI = () => {
  const apiKey = workerEnv.get("apiKey")
  if (!apiKey) {
    throw new Error("apiKey is not set")
  }
  return new OpenAI({
    apiKey,
  })
}

export const pathname = "/api/chat"
export default async function handle(event: FetchEvent) {
  const req = await event.request.json()
  const { messages } = req
  const openai = getOpenAI()
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-0613",
    stream: true,
    messages,
    functions,
  })
  const stream = OpenAIStream(response)
  return new StreamingTextResponse(stream)
}
