import {
  ChatCompletionChunk,
  ChatCompletionRequestStreaming,
} from "@mlc-ai/web-llm"
import { StreamingTextResponse } from "ai"

import { tools } from "@/lib/ai/functions"

declare var self: ServiceWorkerGlobalScope

export async function handleWebLLM(req: any) {
  const { messages, systemPrompt } = req

  const channel = new MessageChannel()
  let cls = await self.clients.matchAll()
  const request: ChatCompletionRequestStreaming = {
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
    tool_choice: "auto",
    tools,
  }

  cls[0].postMessage(
    {
      type: "proxyMsg",
      data: request,
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
