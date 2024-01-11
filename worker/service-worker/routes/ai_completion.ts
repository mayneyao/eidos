import { OpenAIStream, StreamingTextResponse } from "ai"
import OpenAI from "openai"

export const pathname = "/api/completion"
export default async function handle(event: FetchEvent) {
  const req = await event.request.json()
  const { prompt, token, baseUrl, systemPrompt } = req
  const openai = new OpenAI({
    apiKey: token,
    baseURL: baseUrl,
  })
  // Request the OpenAI API for the response based on the prompt
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    stream: true,
    // a precise prompt is important for the AI to reply with the correct tokens
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: 200,
    temperature: 0, // you want absolute certainty for spell check
    top_p: 1,
    frequency_penalty: 1,
    presence_penalty: 1,
  })

  const stream = OpenAIStream(response)

  return new StreamingTextResponse(stream)
}
