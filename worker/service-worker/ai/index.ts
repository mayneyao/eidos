// import { handleGoogleAI } from "./google"
import { DataSpace } from "@/worker/web-worker/DataSpace"
import { IData } from "./interface"
import { handleOpenAI } from "./openai"
import { handleWebLLM } from "./webllm"

export const pathname = "/api/chat"
export default async function handle(event: FetchEvent, ctx?: {
  getDataspace: (space: string) => Promise<DataSpace>
}) {
  const data = (await event.request.json()) as IData
  const { type } = data
  switch (type) {
    case "google":
    // return handleGoogleAI(data)
    case "openai":
      return handleOpenAI(data, ctx)
    default:
      // local model
      return handleWebLLM(data)
  }
}
