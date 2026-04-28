import type { DataSpace } from "@/packages/core/data-space"
import type { IAgentData } from "./interface"
import { handleAgentApi } from "./agent-api"

export const pathname = "/api/agent"
export default async function handle(
  event: FetchEvent,
  ctx?: {
    getDataspace: (space: string) => Promise<DataSpace | null>
  }
) {
  const data = (await event.request.json()) as IAgentData
  if (event.request.method === "POST") {
    return handleAgentApi(data, ctx)
  }
  return new Response(JSON.stringify({ message: "OK" }), { status: 200 })
}
