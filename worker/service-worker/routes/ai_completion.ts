import {
  ChatCompletionContentPartText,
  ChatCompletionRequest,
  ChatCompletionUserMessageParam,
} from "@mlc-ai/web-llm"
import { StreamingTextResponse } from "ai"

import { tools } from "@/lib/ai/functions"

declare var self: ServiceWorkerGlobalScope

export const pathname = "/chat/completions"
export default async function handle(event: FetchEvent): Promise<Response> {
  const data = await event.request.json()
  const { messages, model, systemPrompt } = data
  messages.forEach((msg: ChatCompletionUserMessageParam) => {
    if (typeof msg.content !== "string") {
      msg.content = msg.content
        .map((part) => (part as ChatCompletionContentPartText).text)
        .join(" ")
    }
  })
  if (model.includes("deepseek")) {
    const request = new Request(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: event.request.method,
        headers: event.request.headers,
        body: JSON.stringify({
          ...data,
          messages,
          model: model.split("@")[0],
        }),
      }
    )
    return fetch(request)
  } else {
    // local model
    const channel = new MessageChannel()
    let cls = await self.clients.matchAll()
    const request: ChatCompletionRequest = {
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

    return new Promise((resolve) => {
      channel.port1.onmessage = (e) => {
        const res = e.data as StreamingTextResponse
        resolve(new Response(JSON.stringify(res), { status: 200 }))
      }
    })
  }
}
