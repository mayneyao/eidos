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
        return c.json({ id, messages: [], status: "new" })
      }
      return c.json(session)
    }

    const sessions = await store.listMeta()
    return c.json(sessions)
  }

  const handlePostRequest = async (c: any) => {
    const space = extractSpace(c)
    const data = (await c.req.json()) as IAgentData

    // Fallback if data doesn't provide space
    if (!data.space && space) {
      data.space = space
    }

    console.log("[agent-route] POST /api/agent/sessions", {
      id: data.id,
      space: data.space,
      model: data.model,
    })

    try {
      const result = await handleAgentApi(data, options)
      console.log("[agent-route] ▶ response ready", { id: data.id })
      return result
    } catch (err) {
      console.error("[agent-route] ✖ error", {
        id: data.id,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      })
      throw err
    }
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

  const handleSaveRequest = async (c: any) => {
    const space = extractSpace(c)
    const id = c.req.param("id") || c.req.query("id")
    const body = await c.req.json()

    if (!space || !id) {
      return c.json({ error: "space and id are required" }, 400)
    }

    const dataspace = await options.getDataspace(space)
    if (!dataspace) {
      return c.json({ error: "space not found" }, 404)
    }

    const store = new AgentSessionStore(dataspace)
    const existing = await store.load(id)

    const session: any = {
      id,
      goal: existing?.goal ?? body.goal ?? "",
      status: "completed",
      planSteps: [],
      messages: body.messages ?? [],
      model: body.model ?? existing?.model,
      space: space ?? "",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
      maxSteps: body.maxSteps ?? 10,
    }

    await store.save(session)
    return c.json({ success: true })
  }

  // Handle GET requests
  app.get("/api/agent/sessions/:id?", handleGetRequest)

  // Handle POST requests
  app.post("/api/agent/sessions/:id/save", handleSaveRequest)
  app.post("/api/agent/sessions", handlePostRequest)

  // Handle DELETE requests
  app.delete("/api/agent/sessions/:id?", handleDeleteRequest)

  return app
}
