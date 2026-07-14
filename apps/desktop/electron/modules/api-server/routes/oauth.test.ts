// @vitest-environment node

import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ServerContext } from "../server"
import { setupOAuthRoutes } from "./oauth"

describe("OAuth status routes", () => {
  let app: Hono
  let getAccessToken: ReturnType<typeof vi.fn>
  let broadcastAuthStateChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getAccessToken = vi.fn(async () => null)
    broadcastAuthStateChange = vi.fn()

    const ctx = {
      credentialsManager: {
        getAccessToken,
      },
      broadcastAuthStateChange,
      logger: {
        error: vi.fn(),
      },
    } as unknown as ServerContext

    app = new Hono()
    setupOAuthRoutes(app, ctx)
  })

  it("reports an anonymous session as a successful status response", async () => {
    const response = await app.request("http://localhost/api/auth/user")

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      user: null,
      hasValidTokens: false,
    })
    expect(broadcastAuthStateChange).toHaveBeenCalledWith(false, null)
  })

  it("keeps the access token endpoint protected for anonymous sessions", async () => {
    const response = await app.request("http://localhost/api/auth/token")

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: "Failed to get access token",
    })
  })
})
