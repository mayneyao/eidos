import { Hono } from "hono"
import { AgentSessionStore } from "@/packages/core/agent-session/agent-session-store"
import type { DataSpace } from "@/packages/core/data-space"
import { extractSpace } from "./utils"
import { handleAgentApi, type IAgentData } from "./agent-api"

export function createAgentMiddleware(options: {
  getDataspace: (space: string) => Promise<DataSpace | null>
}) {
  const app = new Hono()

  const handleGetRequest = async (c: any) => {
    const space = extractSpace(c)
    const id = c.req.param("id") || c.req.query("id")

    if (!space) {
      return c.json({ error: "space is required" }, 400)
    }

    const dataspace = await options.getDataspace(space)
    if (!dataspace) {
      return c.json({ error: "space not found" }, 404)
    }

    const store = new AgentSessionStore(dataspace)

    if (id) {
      const session = await store.load(id)
      if (!session) {
        return c.json({ error: "session not found" }, 404)
      }
      return c.json(session)
    }

    const sessions = await store.list()
    return c.json(sessions)
  }

  const handlePostRequest = async (c: any) => {
    const space = extractSpace(c)
    const data = (await c.req.json()) as IAgentData

    // Fallback if data doesn't provide space
    if (!data.space && space) {
      data.space = space
    }

    return await handleAgentApi(data, options)
  }

  const handleDeleteRequest = async (c: any) => {
    const space = extractSpace(c)
    const id = c.req.param("id") || c.req.query("id")

    if (!space || !id) {
      return c.json({ error: "space and id are required" }, 400)
    }

    const dataspace = await options.getDataspace(space)
    if (!dataspace) {
      return c.json({ error: "space not found" }, 404)
    }

    const store = new AgentSessionStore(dataspace)
    await store.delete(id)
    return c.json({ success: true })
  }

  // Handle GET requests
  app.get("/api/agent/sessions/:id?", handleGetRequest)

  // Handle POST requests
  app.post("/api/agent/sessions", handlePostRequest)

  // Handle DELETE requests
  app.delete("/api/agent/sessions/:id?", handleDeleteRequest)

  return app
}
