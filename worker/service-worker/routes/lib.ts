import { ChatCompletionChunk } from "@mlc-ai/web-llm"

declare var self: ServiceWorkerGlobalScope

export async function queryEmbedding(data: {
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

export async function proxyMsg(data: any) {
  const channel = new MessageChannel()
  let cls = await self.clients.matchAll()
  cls[0].postMessage(
    {
      type: "proxyMsg",
      data,
    },
    [channel.port2]
  )
  return new Promise((resolve) => {
    const chunks: any = []
    channel.port1.onmessage = (event) => {
      const chunk = event.data as ChatCompletionChunk
      chunks.push(chunk)
      if (chunk.choices[0].finish_reason === "stop") {
        resolve(chunks)
        channel.port1.close()
      }
    }
  })
}
