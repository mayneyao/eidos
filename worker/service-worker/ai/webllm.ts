import { ChatCompletionChunk } from "@mlc-ai/web-llm"

declare var self: ServiceWorkerGlobalScope

export async function handleWebLLM(req: any) {
  const { messages, systemPrompt, model: modelAndProvider } = req

  const sysPrompt = {
    role: "system" as const,
    content: systemPrompt,
  }
  let newMsgs = [sysPrompt, ...messages]

  const channel = new MessageChannel()
  let cls = await self.clients.matchAll()
  cls[0].postMessage(
    {
      type: "proxyMsg",
      data: {
        stream: true,
        messages: newMsgs,
      },
    },
    [channel.port2]
  )
  const res = await new Promise((resolve) => {
    const chunks: ChatCompletionChunk[] = []
    channel.port1.onmessage = (event) => {
      const chunk = event.data as ChatCompletionChunk
      chunks.push(chunk)
      if (chunk.choices[0].finish_reason === "stop") {
        channel.port1.close()
        resolve(chunks)
      }
    }
  })
  const text = (res as ChatCompletionChunk[])
    .map((chunk) => chunk.choices[0].delta.content ?? "")
    .join("")

  // TODO: implement streaming
  return new Response(text)
}
