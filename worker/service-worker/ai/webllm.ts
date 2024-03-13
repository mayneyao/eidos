import { ChatCompletionChunk } from "@mlc-ai/web-llm"
import { StreamingTextResponse } from "ai"

declare var self: ServiceWorkerGlobalScope

export async function handleWebLLM(req: any) {
  const { messages, systemPrompt } = req

  const channel = new MessageChannel()
  let cls = await self.clients.matchAll()
  cls[0].postMessage(
    {
      type: "proxyMsg",
      data: {
        stream: true,
        messages: [
          systemPrompt?.length
            ? {
                role: "system" as const,
                content: systemPrompt,
              }
            : undefined,
          ...messages,
        ].filter(Boolean),
        temperature: 0,
      },
    },
    [channel.port2]
  )

  const llmStream = new ReadableStream({
    start(controller) {
      channel.port1.onmessage = (event) => {
        const chunk = event.data as ChatCompletionChunk
        const data = new TextEncoder().encode(
          chunk.choices[0].delta.content ?? ""
        )
        controller.enqueue(data)
        if (chunk.choices[0].finish_reason === "stop") {
          channel.port1.close()
          controller.close()
        }
      }
    },
  })

  return new StreamingTextResponse(llmStream)
}
