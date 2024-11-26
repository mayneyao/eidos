import type {
  ChatCompletionChunk,
  ChatCompletionRequestStreaming,
} from "@mlc-ai/web-llm"

import { tools } from "@/lib/ai/functions"
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';


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

  const resp = new ReadableStream({
    start(controller) {
      channel.port1.onmessage = (event) => {
        const chunk = event.data as ChatCompletionChunk
        controller.enqueue(chunk)
        if (chunk.choices[0].finish_reason === "stop") {
          channel.port1.close()
          controller.close()
        }
      }
    },
  })

  const reader = resp.getReader()
  const asyncIterable = {
    [Symbol.asyncIterator]() {
      return {
        next() {
          return reader.read()
        },
      }
    },
  }

}
