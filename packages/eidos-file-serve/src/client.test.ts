import { afterEach, describe, expect, it, vi } from "vitest"

import { createBrowserId, establishCliHostSession } from "./client"
import type { CliHostAccessError } from "./client"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("CLI LAN browser pairing", () => {
  it("exchanges a fragment-safe access key without putting it in the body", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ ok: true }, { status: 200 })
    )
    vi.stubGlobal("fetch", fetch)

    await expect(
      establishCliHostSession("0123456789abcdef0123456789abcdef")
    ).resolves.toBe(true)

    expect(fetch).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer 0123456789abcdef0123456789abcdef",
          "X-Eidos-Client-ID": expect.any(String),
        }),
      })
    )
    const [, request] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(request).not.toHaveProperty("body")
  })

  it("accepts the complete printed LAN access link", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ ok: true }, { status: 200 })
    )
    vi.stubGlobal("fetch", fetch)

    await establishCliHostSession(
      "http://192.168.1.20:8420/#access=abcdefghijklmnop"
    )

    const [, request] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(request).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer abcdefghijklmnop",
      }),
    })
  })

  it("rejects malformed access keys before making a request", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)

    await expect(establishCliHostSession("not a key")).rejects.toMatchObject({
      code: "pairing-failed",
    } satisfies Partial<CliHostAccessError>)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("creates browser IDs without relying on secure-context-only APIs", () => {
    expect(createBrowserId()).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
