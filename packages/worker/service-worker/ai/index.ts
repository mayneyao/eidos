import type { DataSpace } from "@/packages/core/data-space"
import { AgentSessionStore } from "@/packages/core/agent-session/agent-session-store"
import type { IAgentData } from "./interface"
import { handleAgentApi } from "./agent-api"

export const pathname = "/api/agent"

async function handleGet(
  request: Request,
  ctx?: {
    getDataspace: (space: string) => Promise<DataSpace | null>
  }
) {
  const url = new URL(request.url)
  const space = url.searchParams.get("space")
  const id = url.searchParams.get("id")

  if (!space) {
    return new Response(JSON.stringify({ error: "space is required" }), {
      status: 400,
    })
  }

  const dataspace = await ctx?.getDataspace(space)
  if (!dataspace) {
    return new Response(JSON.stringify({ error: "space not found" }), {
      status: 404,
    })
  }

  const store = new AgentSessionStore(dataspace)

  if (id) {
    const session = await store.load(id)
    if (!session) {
      return new Response(JSON.stringify({ error: "session not found" }), {
        status: 404,
      })
    }
    return new Response(JSON.stringify(session), { status: 200 })
  }

  const sessions = await store.list()
  return new Response(JSON.stringify(sessions), { status: 200 })
}

export default async function handle(
  event: FetchEvent,
  ctx?: {
    getDataspace: (space: string) => Promise<DataSpace | null>
  }
) {
  if (event.request.method === "POST") {
    const data = (await event.request.json()) as IAgentData
    return handleAgentApi(data, ctx)
  }
  if (event.request.method === "GET") {
    return handleGet(event.request, ctx)
  }
  return new Response(JSON.stringify({ message: "OK" }), { status: 200 })
}
