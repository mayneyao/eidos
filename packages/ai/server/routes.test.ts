// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAgentMiddleware } from "./routes"

const routeMocks = vi.hoisted(() => ({
  handleAgentApi: vi.fn(),
  listMeta: vi.fn(),
}))

vi.mock("./agent-api", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./agent-api")
  return {
    ...actual,
    handleAgentApi: routeMocks.handleAgentApi,
  }
})

vi.mock("@/packages/core/agent-session/agent-session-store", () => ({
  AgentSessionStore: class AgentSessionStore {
    async listMeta() {
      return routeMocks.listMeta()
    }
  },
}))

function agentBody(space: string) {
  return JSON.stringify({
    id: "session-1",
    goal: "Test request-space binding",
    messages: [],
    model: "test:model",
    space,
  })
}

describe("agent request Space binding", () => {
  let getDataspace: ReturnType<typeof vi.fn>
  let getSpacePath: ReturnType<typeof vi.fn>
  let getSecrets: ReturnType<typeof vi.fn>
  let resolveRequestSpace: ReturnType<typeof vi.fn>
  let app: ReturnType<typeof createAgentMiddleware>

  beforeEach(() => {
    getDataspace = vi.fn(async (space: string) => ({ id: space }))
    getSpacePath = vi.fn((space: string) => `/spaces/${space}`)
    getSecrets = vi.fn(async () => ({ TOKEN: "secret" }))
    resolveRequestSpace = vi.fn(() => ({
      allowed: true as const,
      spaceId: "space-a",
    }))
    routeMocks.listMeta.mockReset()
    routeMocks.listMeta.mockResolvedValue([])
    routeMocks.handleAgentApi.mockReset()
    routeMocks.handleAgentApi.mockImplementation(async (data, context) => {
      await context.getDataspace(data.space)
      context.getSpacePath?.(data.space)
      await context.getSecrets?.()
      return Response.json({ executedFor: data.space })
    })

    const options = {
      getDataspace,
      getSpacePath,
      getSecrets,
      resolveRequestSpace,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }
    app = createAgentMiddleware(options)
  })

  it("rejects a mismatched GET query before opening the requested DataSpace", async () => {
    const response = await app.request(
      "http://space-a.eidos.localhost:13127/api/agent/sessions?space=space-b"
    )

    expect(response.status).toBe(403)
    expect(getDataspace).not.toHaveBeenCalled()
    expect(getSpacePath).not.toHaveBeenCalled()
    expect(getSecrets).not.toHaveBeenCalled()
    expect(routeMocks.handleAgentApi).not.toHaveBeenCalled()
  })

  it("rejects a mismatched POST body before agent setup", async () => {
    const response = await app.request(
      "http://space-a.eidos.localhost:13127/api/agent/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: agentBody("space-b"),
      }
    )

    expect(response.status).toBe(403)
    expect(getDataspace).not.toHaveBeenCalled()
    expect(getSpacePath).not.toHaveBeenCalled()
    expect(getSecrets).not.toHaveBeenCalled()
    expect(routeMocks.handleAgentApi).not.toHaveBeenCalled()
  })

  it("binds matching GET and POST requests to the authorized Space", async () => {
    const getResponse = await app.request(
      "http://space-a.eidos.localhost:13127/api/agent/sessions?space=space-a"
    )
    const postResponse = await app.request(
      "http://space-a.eidos.localhost:13127/api/agent/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: agentBody("space-a"),
      }
    )

    expect(getResponse.status).toBe(200)
    expect(postResponse.status).toBe(200)
    expect(getDataspace).toHaveBeenCalledWith("space-a")
    expect(getSpacePath).toHaveBeenCalledWith("space-a")
    expect(getSecrets).toHaveBeenCalledOnce()
    expect(routeMocks.handleAgentApi).toHaveBeenCalledWith(
      expect.objectContaining({ space: "space-a" }),
      expect.any(Object)
    )
  })

  it("does not apply the agent Space resolver to /api/chat", async () => {
    resolveRequestSpace.mockClear()

    const response = await app.request(
      "http://space-a.eidos.localhost:13127/api/chat"
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ message: "OK" })
    expect(resolveRequestSpace).not.toHaveBeenCalled()
  })

  it("preserves hostname Space extraction when no resolver is configured", async () => {
    const legacyApp = createAgentMiddleware({
      getDataspace,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    })

    const response = await legacyApp.request(
      "http://space-a.eidos.localhost:13127/api/agent/sessions"
    )

    expect(response.status).toBe(200)
    expect(getDataspace).toHaveBeenCalledWith("space-a")
  })
})
