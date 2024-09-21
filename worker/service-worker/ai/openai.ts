import { CoreTool, OpenAIStream, StreamingTextResponse, convertToCoreMessages, streamText } from "ai"
import OpenAI from "openai"
import { createOpenAI } from "@ai-sdk/openai";

import { tools, allFunctions } from "@/lib/ai/functions"

// import { queryEmbedding } from "../routes/lib"
import { IData } from "./interface"

export async function handleOpenAI(
  data: IData,
  options?: {
    useFunctions: boolean
  }
) {
  const { useFunctions = true } = options || {}
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

  // if (
  //   currentPreviewFile &&
  //   // is user query
  //   lastMsg.role === "user"
  // ) {
  //   const res = await queryEmbedding({
  //     query: lastMsg.content,
  //     model: "text-embedding-ada-002",
  //     scope: currentPreviewFile.id,
  //     provider: {
  //       name: "openai",
  //       token: token,
  //     },
  //   })
  //   const context = res?.map((em) => em?.raw_content).join("\n")
  //   newMsgs = [
  //     ...messages,
  //     {
  //       role: "user",
  //       content: `here are some information: \n${context}`,
  //     },
  //   ]
  //   console.log("sw", newMsgs)
  // }
  let request: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model: model ?? "gpt-3.5-turbo-0613",
    stream: true,
    messages: newMsgs,
  } as any
  if (useFunctions) {
    request = {
      ...request,
      tool_choice: "auto",
      tools: tools as any,
    }
  }

  const _tools: Record<string, CoreTool> = {}
  allFunctions.forEach((f) => {
    _tools[f.name] = {
      description: f.description,
      parameters: f.schema
    }
  })
  const result = await streamText({
    model: openai(model ?? "gpt-3.5-turbo-0125"),
    messages: convertToCoreMessages(newMsgs as any),
    tools: _tools,
  })
  // console.log(request)
  // const response = await openai.chat.completions.create(request)
  // const stream = OpenAIStream(response)
  // return new StreamingTextResponse(stream)
  return result.toAIStreamResponse()
}
