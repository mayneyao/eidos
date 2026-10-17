import { WorkerEntrypoint } from "cloudflare:workers"
import { namespaceForUser } from "./auth"

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/

// Only the first-party account Worker has this named binding. It supplies its
// verified session user, never a browser-supplied owner or namespace.
export class SyncAccountEntrypoint extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    const operation = new URL(request.url).pathname
    if (
      request.method !== "POST" ||
      ![
        "/v1/repositories/list",
        "/v1/repositories/status",
        "/v1/repositories/delete",
      ].includes(operation)
    )
      return response({ error: { code: "not_found" } }, 404)
    const body = await boundedBody(request)
    if (
      body === null ||
      typeof body.userId !== "string" ||
      body.userId.length < 1 ||
      body.userId.length > 128 ||
      body.userId !== body.userId.trim() ||
      /\p{Cc}/u.test(body.userId)
    )
      return response({ error: { code: "invalid_request" } }, 400)
    if (
      Object.keys(body).some(
        (key) => key !== "userId" && key !== "name" && key !== "after"
      )
    )
      return response({ error: { code: "invalid_request" } }, 400)
    const namespace = await namespaceForUser(body.userId)
    const directory = this.env.GRAFT_DIRECTORY.getByName(namespace)
    if (operation.endsWith("/list")) {
      if (
        body.after !== undefined &&
        (typeof body.after !== "string" || !NAME.test(body.after))
      )
        return response({ error: { code: "invalid_cursor" } }, 400)
      const repositories = await directory.listManagedRepositories(
        body.userId,
        typeof body.after === "string" ? body.after : ""
      )
      const page = repositories.slice(0, 100)
      return response({
        version: 1,
        repositories: page.map(({ id: _id, ...record }) => record),
        nextCursor: repositories.length > 100 ? page.at(-1)?.name : null,
      })
    }
    if (typeof body.name !== "string" || !NAME.test(body.name))
      return response({ error: { code: "invalid_repository" } }, 400)
    if (operation.endsWith("/status")) {
      const status = await directory.repositoryDeletionStatus(
        body.name,
        body.userId
      )
      return status === null
        ? response({ error: { code: "repository_not_found" } }, 404)
        : response({ version: 1, name: body.name, status })
    }
    const status = await directory.requestDeletion(body.name, body.userId)
    return status === null
      ? response({ error: { code: "repository_not_found" } }, 404)
      : response(
          { version: 1, name: body.name, status },
          status === "deleted" ? 200 : 202
        )
  }
}

async function boundedBody(
  request: Request
): Promise<Record<string, unknown> | null> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 2_048) {
        await reader.cancel()
        return null
      }
      parts.push(part.value)
    }
    const all = new Uint8Array(bytes)
    let offset = 0
    for (const part of parts) {
      all.set(part, offset)
      offset += part.byteLength
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(all))
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

function response(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}
