import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createBrowserId,
  establishCliHostSession,
  uploadCliHostAssets,
} from "./client"
import type { CliHostAccessError } from "./client"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("CLI Serve browser pairing", () => {
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

  it("accepts the complete HTTPS Relay access link", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ ok: true }, { status: 200 })
    )
    vi.stubGlobal("fetch", fetch)

    await establishCliHostSession(
      "https://u-0123456789abcdefabcd.eidos.ink/#access=abcdefghijklmnop"
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

  it("streams explicitly selected assets without base64 encoding", async () => {
    const entry = {
      id: "0198c72d-82b5-7968-b163-98be4b7477df",
      name: "图片 1.png",
      mediaType: "image/png",
      size: "3",
      uri: "assets/%E5%9B%BE%E7%89%87%201.png",
    }
    const fetch = vi.fn(async () =>
      Response.json({ ok: true, value: entry }, { status: 200 })
    )
    vi.stubGlobal("fetch", fetch)
    const file = new File([new Uint8Array([1, 2, 3])], "图片 1.png", {
      type: "image/png",
    })

    await expect(uploadCliHostAssets([file])).resolves.toEqual([entry])

    const [url, request] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toContain("/api/assets/upload?")
    expect(url).toContain("name=%E5%9B%BE%E7%89%87+1.png")
    expect(url).toContain("mediaType=image%2Fpng")
    expect(request).toMatchObject({ method: "POST", body: file })
  })
})
