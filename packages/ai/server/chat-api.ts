import {
  convertToModelMessages,
  extractReasoningMiddleware,
  smoothStream,
  streamText,
  wrapLanguageModel,
} from "ai"
import type { UIMessage } from "ai"

import type { AIFormValues, LLMProvider } from "../config"
import { resolveProviderForModel } from "./model"

export interface IChatData {
  id?: string
  messages?: UIMessage[]
  model?: string
  modelId?: string
  apiKey?: string
  baseUrl?: string
  type?: LLMProvider["type"]
  apiVersion?: LLMProvider["apiVersion"]
  name?: string
  systemPrompt?: string
  chunking?: "word" | "line"
  useTools?: boolean
}

export interface ChatApiContext {
  signal?: AbortSignal
  getAIConfig?: () => AIFormValues | undefined
  logger?: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  }
}

function getValidMessages(messages: UIMessage[] | undefined): UIMessage[] {
  return (messages ?? []).filter(
    (message) =>
      message &&
      (message.role === "system" ||
        message.role === "user" ||
        message.role === "assistant") &&
      Array.isArray(message.parts)
  )
}

/**
 * Lightweight chat endpoint for UI surfaces that use AI SDK useChat but do not
 * need the autonomous agent runtime or persisted agent sessions.
 */
export async function handleChatApi(data: IChatData, ctx?: ChatApiContext) {
  const log = ctx?.logger ?? console
  const messages = getValidMessages(data.messages)

  if (!messages.length) {
    return new Response("messages are required", { status: 400 })
  }

  const { modelId, provider } = resolveProviderForModel(
    data.model,
    ctx?.getAIConfig?.(),
    data
  )

  if (!modelId) {
    return new Response("model is required", { status: 400 })
  }

  log.info("[chat-route] POST /api/chat", {
    id: data.id,
    model: data.model ?? modelId,
    messageCount: messages.length,
  })

  const modelMessages = await convertToModelMessages(messages)
  const hasSystemMessage = messages.some((message) => message.role === "system")
  const result = streamText({
    model: wrapLanguageModel({
      model: provider(modelId),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    }),
    abortSignal: ctx?.signal,
    experimental_transform: smoothStream({
      delayInMs: 20,
      chunking: data.chunking ?? "word",
    }),
    messages: modelMessages,
    system: hasSystemMessage ? undefined : data.systemPrompt,
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onError: (error) => {
      log.error("[chat-route] ✖ stream error", {
        id: data.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return error instanceof Error ? error.message : String(error)
    },
  })
}
