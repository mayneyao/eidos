import { randomUUID } from "node:crypto"
import http from "node:http"
import {
  createGraftRemoteHandler,
  GraftProtocolError,
  type GraftRepositoryBackend,
} from "@eidos.space/graft-remote"

// Synthetic loopback service for the actual native host integration tests.
export async function startEncryptedSyncTestServer() {
  const repositories = new Map<
    string,
    {
      uuid: string
      backend: GraftRepositoryBackend
      objects: Map<string, Uint8Array<ArrayBuffer>>
    }
  >()
  const handler = createGraftRemoteHandler({
    authenticate({ request }) {
      if (
        request.headers.get("authorization") !== "Bearer synthetic-test-token"
      )
        throw new GraftProtocolError(
          401,
          "unauthorized",
          "Synthetic token required"
        )
    },
    backend: ({ repository }) =>
      repositories.get(repository.name)?.backend ?? null,
  })
  const server = http.createServer((incoming, outgoing) => {
    void (async () => {
      const address = server.address()
      if (!address || typeof address === "string")
        throw new Error("Missing test port")
      const url = new URL(
        incoming.url ?? "/",
        `http://127.0.0.1:${address.port}`
      )
      const parts = url.pathname
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent)
      const headers = new Headers()
      for (let i = 0; i < incoming.rawHeaders.length; i += 2)
        headers.append(incoming.rawHeaders[i]!, incoming.rawHeaders[i + 1]!)
      const chunks: Buffer[] = []
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
      const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD"
      const response = await handler({
        request: new Request(url, {
          method: incoming.method,
          headers,
          ...(hasBody ? { body: Buffer.concat(chunks) } : {}),
        }),
        route: {
          namespace: parts[0],
          repository: parts[1],
          operation: parts[2],
          objectPath: parts.slice(3).join("/") || undefined,
        },
        adapterContext: undefined,
      })
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    })().catch(() => {
      outgoing.writeHead(500)
      outgoing.end("Synthetic service failed")
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("Missing test port")
  return {
    createRepository(name: string) {
      const uuid = randomUUID()
      const objects = new Map<string, Uint8Array<ArrayBuffer>>()
      const matches = (a: Uint8Array | undefined, b: Uint8Array | undefined) =>
        a === undefined
          ? b === undefined
          : b !== undefined && Buffer.from(a).equals(Buffer.from(b))
      const backend: GraftRepositoryBackend = {
        encryption: {
          profile: "encrypted-remote-v1",
          version: 1,
          suite: 1,
          uuid,
        },
        head(key) {
          const body = objects.get(key)
          return body ? { size: body.length } : null
        },
        get(key, range) {
          const bytes = objects.get(key)
          return bytes
            ? {
                body: range
                  ? bytes.slice(range.start, range.end + 1)
                  : bytes.slice(),
                size: bytes.length,
              }
            : null
        },
        put(key, value) {
          objects.set(key, value.slice())
        },
        delete(key) {
          objects.delete(key)
        },
        async putIfAbsent(key, value) {
          const bytes = new Uint8Array(await new Response(value).arrayBuffer())
          if (objects.has(key)) return false
          objects.set(key, bytes)
          return true
        },
        compareAndSwap(key, expected, replacement) {
          if (!matches(expected, objects.get(key))) return false
          objects.set(key, replacement.slice())
          return true
        },
        compareAndDelete(key, expected) {
          if (!matches(expected, objects.get(key))) return false
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
      }
      repositories.set(name, { uuid, backend, objects })
      return {
        uuid,
        url: `http://127.0.0.1:${address.port}/u-test/${name}`,
        objects,
      }
    },
    async close() {
      const closed = new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
      server.closeAllConnections()
      await closed
    },
  }
}
