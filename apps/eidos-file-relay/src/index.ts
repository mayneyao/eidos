import { authenticateEidosUser, RelayHttpError, relaySlug } from "./auth"
import { TunnelDurableObject } from "./tunnel"

export { TunnelDurableObject }

const SLUG = /^u-[0-9a-f]{20}$/u

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  })
}

function serviceError(error: unknown): Response {
  if (error instanceof RelayHttpError) {
    return json(
      { error: { code: error.code, message: error.message } },
      error.status,
      error.status === 401 ? { "WWW-Authenticate": "Bearer" } : undefined
    )
  }
  console.error(
    JSON.stringify({
      message: "Eidos Relay request failed",
      error: error instanceof Error ? error.message : String(error),
    })
  )
  return json(
    {
      error: {
        code: "internal_error",
        message: "The Eidos Relay service could not complete this request",
      },
    },
    500
  )
}

function exactOrigin(value: string): string {
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("invalid Relay control origin")
  }
  return url.origin
}

export function publicSlug(
  hostname: string,
  suffix: string,
  labelSuffix: string
): string | null {
  const ending = `.${suffix.toLowerCase()}`
  const lower = hostname.toLowerCase()
  if (!lower.endsWith(ending)) return null
  const label = lower.slice(0, -ending.length)
  if (!label.endsWith(labelSuffix)) return null
  const slug =
    labelSuffix.length > 0 ? label.slice(0, -labelSuffix.length) : label
  return SLUG.test(slug) ? slug : null
}

async function claim(request: Request, env: Env): Promise<Response> {
  const principal = await authenticateEidosUser(request, env)
  const slug = await relaySlug(principal.userId)
  const stub = env.TUNNELS.getByName(slug)
  return await stub.fetch("https://relay.internal/_control/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: principal.userId, slug }),
  })
}

async function connect(
  request: Request,
  env: Env,
  slug: string
): Promise<Response> {
  if (!SLUG.test(slug)) {
    return json({ error: { code: "not_found", message: "Not found" } }, 404)
  }
  const headers = new Headers()
  for (const name of [
    "authorization",
    "connection",
    "sec-websocket-key",
    "sec-websocket-protocol",
    "sec-websocket-version",
    "upgrade",
  ]) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  return await env.TUNNELS.getByName(slug).fetch(
    new Request("https://relay.internal/_connector", {
      headers,
    })
  )
}

async function proxy(
  request: Request,
  env: Env,
  slug: string
): Promise<Response> {
  const target = new URL(request.url)
  const publicOrigin = target.origin
  const headers = new Headers(request.headers)
  headers.set("X-Eidos-Relay-Public-Origin", publicOrigin)
  headers.set("X-Eidos-Relay-Target", target.pathname + target.search)
  headers.delete("X-Eidos-Relay-Internal")
  return await env.TUNNELS.getByName(slug).fetch(
    new Request("https://relay.internal/_proxy", {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    })
  )
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      const controlOrigin = exactOrigin(env.CONTROL_ORIGIN)
      if (url.origin === controlOrigin) {
        if (url.pathname === "/healthz" && request.method === "GET") {
          return json({ service: "eidos-file-relay", status: "ok" })
        }
        if (url.pathname === "/v1/tunnels" && request.method === "POST") {
          return await claim(request, env)
        }
        const match = url.pathname.match(/^\/v1\/connect\/(u-[0-9a-f]{20})$/u)
        if (match?.[1]) return await connect(request, env, match[1])
        return json({ error: { code: "not_found", message: "Not found" } }, 404)
      }
      const slug = publicSlug(
        url.hostname,
        env.PUBLIC_HOST_SUFFIX,
        env.PUBLIC_HOST_LABEL_SUFFIX
      )
      if (!slug) {
        return json({ error: { code: "not_found", message: "Not found" } }, 404)
      }
      return await proxy(request, env, slug)
    } catch (error) {
      return serviceError(error)
    }
  },
} satisfies ExportedHandler<Env>
