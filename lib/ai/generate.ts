import { createOpenAI } from "@ai-sdk/openai"
import { generateText as _generateText } from "ai"

export const generateText = async ({
  prompt,
  modelId,
  systemPrompt,
  config,
}: {
  prompt: string
  systemPrompt?: string
  modelId: string
  config: {
    apiKey: string
    baseURL: string
  }
}) => {
  const openai = createOpenAI(config)
  const model = openai(modelId)
  const res = await _generateText({
    model,
    messages: [{ role: "user", content: prompt }],
    system: systemPrompt,
  })
  return res.text
}
