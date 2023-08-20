import { OpenAIStream, StreamingTextResponse } from "ai"
import OpenAI from "openai"

import { workerEnv } from "@/lib/env"

import { functions } from "./functions"

const getOpenAI = () => {
  const apiKey = workerEnv.get("apiKey")
  if (!apiKey) {
    throw new Error("apiKey is not set")
  }
  return new OpenAI({
    apiKey,
  })
}

export async function chatAPIHandle(event: FetchEvent) {
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
