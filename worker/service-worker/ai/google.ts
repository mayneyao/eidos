import { GoogleGenerativeAI } from "@google/generative-ai"
import { GoogleGenerativeAIStream, Message, StreamingTextResponse } from "ai"

import { IData } from "./interface"

// convert messages from the Vercel AI SDK Format to the format
// that is expected by the Google GenAI SDK
const buildGoogleGenAIPrompt = (messages: Message[]) => {
  const sysPrompt = messages.find((message) => message.role === "system")
  const contents = messages
    .filter(
      (message) => message.role === "user" || message.role === "assistant"
    )
    .map((message) => ({
      role: message.role === "user" ? "user" : "model",
      parts: [{ text: message.content }],
    }))
  contents[0].parts.unshift({ text: sysPrompt?.content || "" })
  return {
    contents,
  }
}

export async function handleGoogleAI(data: IData) {
  const {
    messages,
    systemPrompt,
    model: modelAndProvider,
    apiKey,
    // GOOGLE_API_KEY,
  } = data
  const genAI = new GoogleGenerativeAI(apiKey || "")

  const model = modelAndProvider.split("@")[0]
  const sysPrompt = {
    role: "system" as const,
    content: systemPrompt,
  }
  let newMsgs = [sysPrompt, ...messages]
  const geminiStream = await genAI
    .getGenerativeModel({ model })
    .generateContentStream(buildGoogleGenAIPrompt(newMsgs as any))

  // Convert the response into a friendly text-stream
  const stream = GoogleGenerativeAIStream(geminiStream)
  // Respond with the stream
  return new StreamingTextResponse(stream)
}
