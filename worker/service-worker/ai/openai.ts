import { OpenAIStream, StreamingTextResponse } from "ai"
import OpenAI from "openai"

import { functions } from "@/lib/ai/functions"

import { queryEmbedding } from "../routes/lib"

export async function handleOpenAI(req: any) {
  const {
    messages,
    token,
    baseUrl,
    systemPrompt,
    model: modelAndProvider,
    currentPreviewFile,
  } = req

  const model = modelAndProvider.split("@")[0]
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
    const context = res?.map((em) => em?.raw_content).join("\n")
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
