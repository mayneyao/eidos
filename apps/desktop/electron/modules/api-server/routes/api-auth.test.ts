// @vitest-environment node

import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ServerContext } from "../server"
import { setupApiRoutes } from "./api"

vi.mock("@/packages/ai/server", async () => {
  const { Hono: ActualHono } = await vi.importActual<{ Hono: typeof Hono }>(
    "hono"
  )
  return {
    PermissionServer: class PermissionServer {
      getPort() {
        return 0
      }
    },
    createAgentMiddleware: () => new ActualHono(),
  }
})

vi.mock("../../sync/credentials", () => ({
  getCredentialsManager: () => ({ listSecrets: async () => [] }),
}))

vi.mock("../../../utils/paths", () => ({
  getSpacePath: () => undefined,
}))

function rpcRequestInit(origin: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      method: "doc.get",
      params: ["note-1"],
      scope: "space",
    }),
  }
}

describe("Space-bound RPC authorization", () => {
  let app: Hono
  let getSpace: ReturnType<typeof vi.fn>
  let getOrSetDataSpace: ReturnType<typeof vi.fn>
  let executePayload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    executePayload = vi.fn(async (payload) => ({
      executedFor: payload.space,
    }))
    getSpace = vi.fn((spaceId: string) =>
      spaceId === "space-a" || spaceId === "space-b"
        ? { id: spaceId, mode: "file", path: `/tmp/${spaceId}` }
        : undefined
    )
    getOrSetDataSpace = vi.fn(async () => ({
      _executePayload: executePayload,
    }))

    const ctx = {
      spaceRegistry: { getSpace },
      dataSpaceManager: { getOrSetDataSpace },
      configManager: {
        get: vi.fn(),
        set: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        child: () => ({ info: vi.fn() }),
      },
    } as unknown as ServerContext

    app = new Hono()
    setupApiRoutes(app, ctx)
  })

  it.each([
    "http://sandbox.space-a.eidos.localhost:13127",
    "http://extension.block.space-a.eidos.localhost:13127",
  ])("rejects cross-Space RPC from %s before data access", async (origin) => {
    const response = await app.request(
      "http://space-b.eidos.localhost:13127/rpc",
      rpcRequestInit(origin)
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ success: false })
    expect(getSpace).not.toHaveBeenCalled()
    expect(getOrSetDataSpace).not.toHaveBeenCalled()
    expect(executePayload).not.toHaveBeenCalled()
  })

  it("allows a same-Space block to execute RPC", async () => {
    const response = await app.request(
      "http://space-a.eidos.localhost:13127/rpc",
      rpcRequestInit("http://extension.block.space-a.eidos.localhost:13127")
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { executedFor: "space-a" },
    })
    expect(getOrSetDataSpace).toHaveBeenCalledWith("space-a")
    expect(executePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "doc.get",
        params: ["note-1"],
        space: "space-a",
        dbName: "space-a",
      })
    )
  })

  it("allows a legitimate same-Space loopback smart client", async () => {
    const init = rpcRequestInit("http://sandbox.space-a.eidos.localhost:13127")
    const response = await app.request("http://127.0.0.1:13127/rpc", {
      ...init,
      headers: {
        ...init.headers,
        Host: "127.0.0.1:13127",
        "X-Forwarded-Host": "space-a.eidos.localhost:13127",
      },
    })

    expect(response.status).toBe(200)
    expect(getOrSetDataSpace).toHaveBeenCalledWith("space-a")
    expect(executePayload).toHaveBeenCalledOnce()
  })
})
