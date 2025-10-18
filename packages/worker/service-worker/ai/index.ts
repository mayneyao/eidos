// import { handleGoogleAI } from "./google"
import type { DataSpace } from "@/packages/core/data-space"
import type { IData } from "./interface"
import { handleChatApi } from "./chat-api"

export const pathname = "/api/chat"
export default async function handle(event: FetchEvent, ctx?: {
  getDataspace: (space: string) => Promise<DataSpace | null>
}) {
  const data = (await event.request.json()) as IData
  // if request is post execute, then return 200 immediately
  if (event.request.method === "POST") {
    return handleChatApi(data, ctx)
  }
  console.log("request", event.request)
  return new Response(JSON.stringify({ message: "OK" }), { status: 200 })
}
