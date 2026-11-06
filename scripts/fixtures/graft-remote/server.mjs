// Disposable loopback Graft service for native mobile interoperability tests.
// Uses the same published protocol engine as the desktop custom-server tests.
import { createServer } from "node:http"
import { Readable } from "node:stream"
import { randomUUID } from "node:crypto"
import { loadFixtureEngine } from "./engine.mjs"

const { createGraftRemoteHandler, GraftProtocolError } =
  await loadFixtureEngine()

const token = "mobile-custom-sync-synthetic-token-00000000"
const uuid = "00010203-0405-4607-8809-0a0b0c0d0e0f"
const stores = new Map()
function repository(name, identity) {
  const objects = new Map()
  const equal = (a, b) =>
    a === undefined
      ? b === undefined
      : b !== undefined && Buffer.from(a).equals(Buffer.from(b))
  return {
    name,
    uuid: identity,
    objects,
    backend: {
      ...(identity
        ? {
            encryption: {
              profile: "encrypted-remote-v1",
              version: 1,
              suite: 1,
              uuid: identity,
            },
          }
        : {}),
      head(key) {
        const body = objects.get(key)
        return body === undefined ? null : { size: body.length }
      },
      get(key, range) {
        const bytes = objects.get(key)
        if (!bytes) return null
        const body = range ? bytes.slice(range.start, range.end + 1) : bytes
        return { body, size: body.length }
      },
      put(key, value) {
        objects.set(key, value.slice())
      },
      delete(key) {
        objects.delete(key)
      },
      async putIfAbsent(key, value) {
        if (objects.has(key)) return false
        objects.set(
          key,
          new Uint8Array(await new Response(value).arrayBuffer())
        )
        return true
      },
      compareAndSwap(key, expected, replacement) {
        if (!equal(expected, objects.get(key))) return false
        objects.set(key, replacement.slice())
        return true
      },
      compareAndDelete(key, expected) {
        if (!equal(expected, objects.get(key))) return false
        objects.delete(key)
        return true
      },
      list(query) {
        const paths = [...objects.keys()]
          .filter(
            (key) =>
              key.startsWith(query.prefix) &&
              (!query.after || key > query.after)
          )
          .sort()
        return {
          paths: paths.slice(0, query.limit),
          hasMore: paths.length > query.limit,
        }
      },
    },
  }
}
stores.set("test", repository("test", uuid))
stores.set("raw", repository("raw", null))
const handler = createGraftRemoteHandler({
  authenticate({ request }) {
    if (request.headers.get("authorization") !== `Bearer ${token}`)
      throw new GraftProtocolError(
        401,
        "unauthorized",
        "Synthetic token required"
      )
    return "personal"
  },
  authorize() {},
  backend({ repository }) {
    return repository.namespace === "personal"
      ? (stores.get(repository.name)?.backend ?? null)
      : null
  },
})
const server = createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://127.0.0.1:${server.address().port}`
    const url = new URL(incoming.url, origin)
    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent)
    const headers = new Headers()
    for (let i = 0; i < incoming.rawHeaders.length; i += 2)
      headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1])
    const request = new Request(url, {
      method: incoming.method,
      headers,
      ...(!["GET", "HEAD"].includes(incoming.method)
        ? { body: Readable.toWeb(incoming), duplex: "half" }
        : {}),
    })
    const json = (value) =>
      Response.json(value, { headers: { "Graft-Protocol": "1" } })
    let response
    if (url.pathname === "/.well-known/graft")
      response = json({
        protocol: "graft-remote",
        version: 1,
        remote_url_template: `${origin}/personal/{repository}`,
        authentication: { scheme: "bearer", authority: origin },
        management: { repositories: `${origin}/api/graft/repositories` },
      })
    else if (url.pathname.startsWith("/api/graft/repositories")) {
      if (request.headers.get("authorization") !== `Bearer ${token}`)
        response = new Response(null, { status: 401 })
      else if (incoming.method === "PUT" && parts.length === 4) {
        let item = stores.get(parts[3])
        const created = !item
        if (!item) {
          item = repository(parts[3], randomUUID())
          stores.set(parts[3], item)
        }
        response = json({
          created,
          namespace: "personal",
          repository: item.name,
          remote_url: `${origin}/personal/${item.name}`,
          encryption: item.backend.encryption,
        })
      } else
        response = json({
          namespace: "personal",
          repositories: [...stores.values()].map((item) => ({
            name: item.name,
            display_name: item.name,
            remote_url: `${origin}/personal/${item.name}`,
            created_at: 1,
            ...(item.uuid ? { encryption: item.backend.encryption } : {}),
          })),
        })
    } else
      response = await handler({
        request,
        route: {
          namespace: parts[0],
          repository: parts[1],
          operation: parts[2],
          objectPath: parts.slice(3).join("/") || undefined,
        },
        adapterContext: undefined,
      })
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body)
      for await (const chunk of Readable.fromWeb(response.body))
        outgoing.write(chunk)
    outgoing.end()
  } catch {
    outgoing.writeHead(500)
    outgoing.end()
  }
})
server.listen(0, "127.0.0.1", () =>
  process.stdout.write(
    JSON.stringify({
      origin: `http://127.0.0.1:${server.address().port}`,
      uuid,
    }) + "\n"
  )
)
setTimeout(() => server.close(), 600000).unref()
