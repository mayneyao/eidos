import { handleGoogleAI } from "./google"
import { IData } from "./interface"
import { handleOpenAI } from "./openai"
import { handleWebLLM } from "./webllm"

export const pathname = "/api/chat"
export default async function handle(event: FetchEvent) {
  const data = (await event.request.json()) as IData
  const { type } = data
  switch (type) {
    case "google":
      return handleGoogleAI(data)
    case "openai":
      return handleOpenAI(data)
    default:
      // local model
      return handleWebLLM(data)
  }
}
