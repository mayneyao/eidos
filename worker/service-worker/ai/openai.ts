import { createOpenAI } from "@ai-sdk/openai";
import { CoreTool, convertToCoreMessages, streamText } from "ai";

import { allFunctions } from "@/lib/ai/functions";

// import { queryEmbedding } from "../routes/lib"
import { isDesktopMode } from "@/lib/env";
import { IData } from "./interface";


export async function handleOpenAI(
  data: IData,
  options?: {
    useFunctions: boolean
  }
) {
  // only use functions on desktop app
  const { useFunctions = isDesktopMode } = options || {}
  const {
    messages,
    apiKey,
    baseUrl,
    systemPrompt,
    model: modelAndProvider,
    // currentPreviewFile,
  } = data

  const model = modelAndProvider.split("@")[0]
  const openai = createOpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  })

  const lastMsg = messages[messages.length - 1]
  let newMsgs = messages
  if (systemPrompt?.length) {
    newMsgs = [
      {
        id: "system",
        role: "system" as const,
        content: systemPrompt,
      },
      ...messages,
    ]
  }

  const _tools: Record<string, CoreTool> = {}
  allFunctions.forEach((f) => {
    _tools[f.name] = {
      description: f.description,
      parameters: f.schema
    }
  })
  let request: Parameters<typeof streamText>[0] = {
    model: openai(model ?? "gpt-3.5-turbo-0125"),
    messages: convertToCoreMessages(newMsgs as any),
  }
  if (useFunctions) {
    request = {
      ...request,
      tools: _tools,
    }
  }
  const result = await streamText(request)
  return result.toAIStreamResponse()
}
