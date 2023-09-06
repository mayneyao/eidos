import { OpenAIStream, StreamingTextResponse, nanoid } from "ai"
import OpenAI from "openai"

import { functions } from "@/lib/ai/functions"

declare var self: ServiceWorkerGlobalScope

async function queryEmbedding(data: {
  query: string
  model: string
  scope: string
  k?: number
  provider: {
    name: "openai"
    token: string
  }
}): Promise<any[]> {
  const channel = new MessageChannel()
  let cls = await self.clients.matchAll()
  console.log(cls)
  cls[0].postMessage(
    {
      type: "queryEmbedding",
      data,
    },
    [channel.port2]
  )
  return new Promise((resolve) => {
    channel.port1.onmessage = (event) => {
      resolve(event.data)
      channel.port1.close()
    }
  })
}

export const pathname = "/api/chat"
export default async function handle(event: FetchEvent) {
  const req = await event.request.json()
  const { messages, token, baseUrl, systemPrompt, model, currentPreviewFile } =
    req
  const openai = new OpenAI({
    apiKey: token,
    baseURL: baseUrl,
  })
  const sysPrompt = {
    role: "system" as const,
    content: systemPrompt,
  }
  const lastMsg = messages[messages.length - 1]
  let newMsgs = [...messages, sysPrompt]
  if (
    currentPreviewFile &&
    // is user query
    lastMsg.role === "user"
  ) {
    const res = await queryEmbedding({
      query: lastMsg.content,
      model: "text-embedding-ada-002",
      scope: currentPreviewFile.id,
      provider: {
        name: "openai",
        token: token,
      },
    })
    const context = res?.map((em) => em?.rawContent).join("\n")
    newMsgs = [
      ...messages,
      {
        role: "user",
        content: `here are some information: \n${context}`,
      },
      sysPrompt,
    ]
    console.log("sw", newMsgs)
  }
  const response = await openai.chat.completions.create({
    model: model ?? "gpt-3.5-turbo-0613",
    stream: true,
    messages: newMsgs,
    functions,
  })
  const stream = OpenAIStream(response)
  return new StreamingTextResponse(stream)
}
