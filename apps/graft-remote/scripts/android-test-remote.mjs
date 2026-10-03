// Loopback-only, ephemeral Graft protocol fixture for native Android tests.
// Uses the published handler; stores only synthetic test data in memory.
import { createServer } from "node:http"
import { Readable } from "node:stream"
import {
  createGraftRemoteHandler,
  GraftProtocolError,
  bytesEqual,
  bytewiseCompare,
} from "@eidos.space/graft-remote"

class MemoryRepository {
  objects = new Map()
  head(path) {
    const value = this.objects.get(path)
    return value === undefined ? null : { size: value.byteLength }
  }
  get(path, range) {
    const value = this.objects.get(path)
    return value === undefined
      ? null
      : {
          body: range ? value.slice(range.start, range.end + 1) : value.slice(),
          size: value.byteLength,
        }
  }
  put(path, value) {
    this.objects.set(path, value.slice())
  }
  delete(path) {
    this.objects.delete(path)
  }
  async putIfAbsent(path, body) {
    const value = new Uint8Array(await new Response(body).arrayBuffer())
    // Test and write together after reading the stream: preserve atomicity.
    if (this.objects.has(path)) return false
    this.objects.set(path, value)
    return true
  }
  matches(path, expected) {
    const current = this.objects.get(path)
    return expected === undefined
      ? current === undefined
      : current !== undefined && bytesEqual(current, expected)
  }
  compareAndSwap(path, expected, replacement) {
    if (!this.matches(path, expected)) return false
    this.objects.set(path, replacement.slice())
    return true
  }
  compareAndDelete(path, expected) {
    if (!this.matches(path, expected)) return false
    this.objects.delete(path)
    return true
  }
  list(query) {
    const matching = [...this.objects.keys()]
      .filter(
        (path) =>
          path.startsWith(query.prefix) &&
          (query.after === undefined || bytewiseCompare(path, query.after) > 0)
      )
      .sort(bytewiseCompare)
    const paths = matching.slice(0, query.limit)
    return {
      paths,
      hasMore: matching.length > query.limit,
      entries: paths.map((path) => ({
        path,
        size: this.objects.get(path).byteLength,
      })),
    }
  }
}

const repositories = new Map()
const handler = createGraftRemoteHandler({
  authenticate({ request }) {
    if (
      request.headers.get("Authorization") !== "Bearer ephemeral-test-token"
    ) {
      throw new GraftProtocolError(401, "unauthorized", "Test token required")
    }
  },
  backend({ repository }) {
    if (!repositories.has(repository.id))
      repositories.set(repository.id, new MemoryRepository())
    return repositories.get(repository.id)
  },
})
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, "http://127.0.0.1")
    const [namespace, repository, operation, ...path] = url.pathname
      .slice(1)
      .split("/")
      .map(decodeURIComponent)
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      body: ["GET", "HEAD"].includes(incoming.method)
        ? undefined
        : Readable.toWeb(incoming),
      duplex: "half",
    })
    const response = await handler({
      request,
      route: {
        namespace,
        repository,
        operation,
        objectPath: path.join("/") || undefined,
      },
      adapterContext: undefined,
    })
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing)
    else outgoing.end()
  } catch (error) {
    console.error(error.message)
    outgoing.writeHead(500).end()
  }
})
server.listen(Number(process.env.PORT ?? 0), "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${server.address().port}`)
})
process.on("SIGTERM", () => server.close())
process.on("SIGINT", () => server.close())
