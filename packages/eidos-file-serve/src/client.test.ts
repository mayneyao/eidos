import { afterEach, describe, expect, it, vi } from "vitest"

import {
  acquireCliHostRemoteAsset,
  createBrowserId,
  establishCliHostSession,
  fetchCliHostManifest,
  subscribeCliHostEvents,
  uploadCliHostAssets,
} from "./client"
import type { CliHostAccessError } from "./client"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("CLI Serve browser pairing", () => {
  it("reopens the app after reconnecting to a different Serve process", () => {
    class TestEventSource {
      static current: TestEventSource | undefined
      readonly close = vi.fn()
      private readonly listeners = new Map<
        string,
        Array<(event: { data?: string }) => void>
      >()

      constructor(readonly url: string) {
        TestEventSource.current = this
      }

      addEventListener(
        type: string,
        listener: (event: { data?: string }) => void
      ) {
        const listeners = this.listeners.get(type) ?? []
        listeners.push(listener)
        this.listeners.set(type, listeners)
      }

      emit(type: string, value?: unknown) {
        const event = value === undefined ? {} : { data: JSON.stringify(value) }
        for (const listener of this.listeners.get(type) ?? []) listener(event)
      }
    }

    const onOpen = vi.fn()
    const onInstanceChange = vi.fn()
    vi.stubGlobal("EventSource", TestEventSource)

    const unsubscribe = subscribeCliHostEvents({
      onRevision: vi.fn(),
      onOpen,
      onInstanceChange,
    })
    const events = TestEventSource.current!
    expect(events.url).toContain("/api/events?client=")

    events.emit("open")
    events.emit("instance", { instanceId: "serve-one" })
    expect(onOpen).toHaveBeenCalledTimes(1)

    events.emit("open")
    events.emit("instance", { instanceId: "serve-one" })
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onInstanceChange).not.toHaveBeenCalled()

    events.emit("open")
    events.emit("instance", { instanceId: "serve-two" })
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(events.close).toHaveBeenCalledOnce()
    expect(onInstanceChange).toHaveBeenCalledOnce()

    unsubscribe()
  })

  it("accepts a strict read-only Publish manifest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          mode: "publish",
          fileName: "published.eidos",
          access: "read",
          network: "publish-container",
        })
      )
    )

    await expect(fetchCliHostManifest()).resolves.toMatchObject({
      mode: "publish",
      access: "read",
      network: "publish-container",
    })
  })

  it("rejects a Publish manifest that requests write access", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          mode: "publish",
          fileName: "published.eidos",
          access: "readwrite",
        })
      )
    )

    await expect(fetchCliHostManifest()).resolves.toBeNull()
  })

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
      "https://r-0123456789abcdefabcd.eidos.ink/#access=abcdefghijklmnop"
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

  it("acquires remote File entries with an explicit JSON request", async () => {
    const entry = {
      id: "0198c72d-82b5-7968-b163-98be4b7477de",
      name: "report.pdf",
      mediaType: "application/pdf",
      size: "1024",
      uri: "https://cdn.example.com/report.pdf",
    }
    const fetch = vi.fn(async () =>
      Response.json({ ok: true, value: entry }, { status: 200 })
    )
    vi.stubGlobal("fetch", fetch)

    await expect(
      acquireCliHostRemoteAsset(entry.uri, entry.name)
    ).resolves.toEqual(entry)
    expect(fetch).toHaveBeenCalledWith(
      "/api/assets/remote",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ uri: entry.uri, name: entry.name }),
      })
    )
  })

  it("exchanges a Publish Gateway ticket and prefixes Runtime requests", async () => {
    vi.stubGlobal("document", {
      querySelector: () => ({ getAttribute: () => "team-wiki" }),
    })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            status: "starting",
            ticket: "signed-runtime-ticket",
            runtimeBase: "/_eidos/runtime/team-wiki",
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          },
          { status: 202 }
        )
      )
      .mockResolvedValueOnce(
        Response.json({
          mode: "publish",
          fileName: "team.eidos",
          access: "read",
          network: "publish-container",
        })
      )
    vi.stubGlobal("fetch", fetch)

    await expect(fetchCliHostManifest()).resolves.toMatchObject({
      mode: "publish",
      access: "read",
    })
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/_eidos/session",
      expect.objectContaining({ body: JSON.stringify({ slug: "team-wiki" }) })
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/_eidos/runtime/team-wiki/api/manifest",
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    )
    const request = fetch.mock.calls[1]?.[1] as RequestInit
    expect(new Headers(request.headers).get("authorization")).toBe(
      "EidosRuntime signed-runtime-ticket"
    )
  })
})
