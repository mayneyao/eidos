import { SELF, abortAllDurableObjects } from "cloudflare:test"
import { afterEach, describe, expect, it } from "vitest"

import { publicSlug } from "../src/index"

interface TunnelClaim {
  protocol: number
  publicUrl: string
  connectorUrl: string
  connectorToken: string
  connectorExpiresAt: number
}

interface RelayRequest {
  v: number
  type: "request"
  id: string
  method: string
  path: string
  headers: Array<[string, string]>
  body?: string
}

afterEach(async () => {
  await abortAllDurableObjects()
})

describe("Eidos File Relay", () => {
  it("matches production and single-label staging hostnames exactly", () => {
    expect(
      publicSlug("u-0123456789abcdefabcd.eidos.ink", "eidos.ink", "")
    ).toBe("u-0123456789abcdefabcd")
    expect(
      publicSlug(
        "u-0123456789abcdefabcd-staging.eidos.ink",
        "eidos.ink",
        "-staging"
      )
    ).toBe("u-0123456789abcdefabcd")
    expect(
      publicSlug("u-0123456789abcdefabcd.eidos.ink", "eidos.ink", "-staging")
    ).toBeNull()
  })

  it("does not provision unclaimed public hostnames", async () => {
    const response = await SELF.fetch(
      "https://u-00000000000000000000.eidos.ink/"
    )
    expect(response.status).toBe(404)
  })

  it("requires an Eidos account and derives a stable opaque hostname", async () => {
    const missing = await SELF.fetch("https://relay.eidos.ink/v1/tunnels", {
      method: "POST",
    })
    expect(missing.status).toBe(401)
    expect(missing.headers.get("www-authenticate")).toBe("Bearer")

    const first = await claim("alice-token")
    const second = await claim("alice-token")
    const other = await claim("bob-token")
    expect(new URL(first.publicUrl).hostname).toMatch(
      /^u-[0-9a-f]{20}\.eidos\.ink$/u
    )
    expect(new URL(second.publicUrl).hostname).toBe(
      new URL(first.publicUrl).hostname
    )
    expect(new URL(other.publicUrl).hostname).not.toBe(
      new URL(first.publicUrl).hostname
    )
    expect(first.connectorToken).not.toBe(second.connectorToken)
    expect(new URL(first.publicUrl).hash).toMatch(/^#access=.+/u)
    expect(first.connectorUrl).not.toContain(first.connectorToken)
  })

  it("pairs a browser at the edge and streams a connector response", async () => {
    const claimValue = await claim("alice-token")
    const connector = await connect(claimValue)
    const publicUrl = new URL(claimValue.publicUrl)
    const accessKey = new URLSearchParams(publicUrl.hash.slice(1)).get("access")
    expect(accessKey).not.toBeNull()

    const unauthorized = await SELF.fetch(new URL("/api/manifest", publicUrl), {
      headers: { Origin: publicUrl.origin },
    })
    expect(unauthorized.status).toBe(401)

    const paired = await SELF.fetch(new URL("/api/session", publicUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessKey}`,
        Origin: publicUrl.origin,
      },
    })
    expect(paired.status).toBe(200)
    const cookie = paired.headers.get("set-cookie")?.split(";", 1)[0]
    expect(cookie).toMatch(/^__Host-eidos_relay_session=/u)

    const relayRequestPromise = nextRelayRequest(connector)
    const responsePromise = SELF.fetch(new URL("/api/manifest", publicUrl), {
      headers: {
        Cookie: cookie ?? "",
        Origin: publicUrl.origin,
        "X-Eidos-Client-ID": "browser-one",
      },
    })
    const relayRequest = await relayRequestPromise
    expect(relayRequest).toMatchObject({
      v: 1,
      type: "request",
      method: "GET",
      path: "/api/manifest",
    })
    expect(Object.fromEntries(relayRequest.headers)).toEqual({
      "x-eidos-client-id": "browser-one",
    })

    connector.send(
      JSON.stringify({
        v: 1,
        type: "response.start",
        id: relayRequest.id,
        status: 200,
        headers: [["Content-Type", "application/json"]],
      })
    )
    connector.send(
      JSON.stringify({
        v: 1,
        type: "response.body",
        id: relayRequest.id,
        body: btoa('{"network":"relay","access":"readwrite"}'),
      })
    )
    connector.send(
      JSON.stringify({
        v: 1,
        type: "response.end",
        id: relayRequest.id,
      })
    )

    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(await response.json()).toEqual({
      network: "relay",
      access: "readwrite",
    })
    connector.close(1000, "test complete")
  })

  it("rejects hostile origins, oversized requests, and reused connector tickets", async () => {
    const claimValue = await claim("alice-token")
    const connector = await connect(claimValue)
    const reused = await connectResponse(claimValue)
    expect(reused.status).toBe(401)

    const publicUrl = new URL(claimValue.publicUrl)
    const hostile = await SELF.fetch(new URL("/api/session", publicUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${new URLSearchParams(publicUrl.hash.slice(1)).get("access")}`,
        Origin: "https://attacker.example",
      },
    })
    expect(hostile.status).toBe(403)

    const accessKey = new URLSearchParams(publicUrl.hash.slice(1)).get("access")
    const paired = await SELF.fetch(new URL("/api/session", publicUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessKey}`,
        Origin: publicUrl.origin,
      },
    })
    const cookie = paired.headers.get("set-cookie")?.split(";", 1)[0] ?? ""
    const oversized = await SELF.fetch(
      new URL("/api/runtime/call", publicUrl),
      {
        method: "POST",
        headers: {
          "Content-Length": String(4 * 1024 * 1024 + 1),
          "Content-Type": "application/json",
          Cookie: cookie,
          Origin: publicUrl.origin,
        },
        body: "{}",
      }
    )
    expect(oversized.status).toBe(413)
    connector.close(1000, "test complete")
  })

  it("bounds browser sessions for a shared access link", async () => {
    const claimValue = await claim("alice-token")
    const publicUrl = new URL(claimValue.publicUrl)
    const accessKey = new URLSearchParams(publicUrl.hash.slice(1)).get("access")
    const cookies: string[] = []
    for (let index = 0; index < 65; index += 1) {
      const paired = await SELF.fetch(new URL("/api/session", publicUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessKey}`,
          Origin: publicUrl.origin,
        },
      })
      expect(paired.status).toBe(200)
      cookies.push(paired.headers.get("set-cookie")?.split(";", 1)[0] ?? "")
    }

    const evicted = await SELF.fetch(new URL("/api/manifest", publicUrl), {
      headers: { Cookie: cookies[0] ?? "", Origin: publicUrl.origin },
    })
    expect(evicted.status).toBe(401)
    const newest = await SELF.fetch(new URL("/api/manifest", publicUrl), {
      headers: { Cookie: cookies.at(-1) ?? "", Origin: publicUrl.origin },
    })
    expect(newest.status).toBe(503)
  })
})

async function claim(token: string): Promise<TunnelClaim> {
  const response = await SELF.fetch("https://relay.eidos.ink/v1/tunnels", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status).toBe(200)
  return (await response.json()) as TunnelClaim
}

async function connectResponse(claimValue: TunnelClaim): Promise<Response> {
  const endpoint = new URL(claimValue.connectorUrl)
  endpoint.protocol = "https:"
  return await SELF.fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${claimValue.connectorToken}`,
      Upgrade: "websocket",
    },
  })
}

async function connect(claimValue: TunnelClaim): Promise<WebSocket> {
  const response = await connectResponse(claimValue)
  expect(response.status).toBe(101)
  expect(response.webSocket).toBeDefined()
  const webSocket = response.webSocket as WebSocket
  webSocket.accept()
  return webSocket
}

async function nextRelayRequest(webSocket: WebSocket): Promise<RelayRequest> {
  return await new Promise<RelayRequest>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for Relay request")),
      5_000
    )
    webSocket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout)
        try {
          resolve(JSON.parse(String(event.data)) as RelayRequest)
        } catch (error) {
          reject(error)
        }
      },
      { once: true }
    )
  })
}
