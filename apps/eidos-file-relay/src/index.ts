import { authenticateEidosUser, RelayHttpError, relaySlug } from "./auth"
import {
  browserAuthStateSlug,
  browserPublicOrigin,
  createBrowserAuthorization,
  exchangeBrowserAuthorization,
} from "./browser-auth"
import { TunnelDurableObject } from "./tunnel"
import { relayInternalSlug } from "./public-host"

export { TunnelDurableObject }

const SLUG = /^u-[0-9a-f]{20}$/u
const CLAIM_BODY_BYTES_MAX = 1024

type BrowserAccess = "account" | "share"

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

function redirect(location: string, status: 302 | 303 = 302): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Location: location,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function authPage(title: string, message: string, status: number): Response {
  const body = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>${title}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:12vh auto;padding:0 1.5rem;color:#202124}h1{font-size:1.35rem}p{color:#5f6368}</style><main><h1>${title}</h1><p>${message}</p></main></html>`
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

async function claimBrowserAccess(request: Request): Promise<BrowserAccess> {
  if (request.body === null) return "share"
  const declaredLength = Number(request.headers.get("content-length"))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > CLAIM_BODY_BYTES_MAX
  ) {
    throw new RelayHttpError(
      413,
      "request_too_large",
      "Claim body is too large"
    )
  }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > CLAIM_BODY_BYTES_MAX) {
      await reader.cancel()
      throw new RelayHttpError(
        413,
        "request_too_large",
        "Claim body is too large"
      )
    }
    chunks.push(value)
  }
  if (size === 0) return "share"
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new RelayHttpError(400, "invalid_request", "Invalid claim body")
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RelayHttpError(400, "invalid_request", "Invalid claim body")
  }
  const body = value as Record<string, unknown>
  if (
    Object.keys(body).length !== 1 ||
    (body.browserAccess !== "account" && body.browserAccess !== "share")
  ) {
    throw new RelayHttpError(400, "invalid_request", "Invalid claim body")
  }
  return body.browserAccess
}

export function publicSlug(
  hostname: string,
  suffix: string,
  labelSuffix: string
): string | null {
  return relayInternalSlug(hostname, suffix, labelSuffix)
}

async function claim(request: Request, env: Env): Promise<Response> {
  const principal = await authenticateEidosUser(request, env)
  const browserAccess = await claimBrowserAccess(request)
  const slug = await relaySlug(principal.userId)
  const stub = env.TUNNELS.getByName(slug)
  return await stub.fetch("https://relay.internal/_control/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: principal.userId,
      slug,
      browserAccess,
    }),
  })
}

function publicReturn(
  value: string | null,
  env: Env
): {
  origin: string
  slug: string
} | null {
  if (value === null || value.length > 2048) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null
  }
  const slug = publicSlug(
    url.hostname,
    env.PUBLIC_HOST_SUFFIX,
    env.PUBLIC_HOST_LABEL_SUFFIX
  )
  if (!slug) return null
  const canonicalOrigin = browserPublicOrigin(slug, env)
  const legacyOrigin = url.hostname.startsWith("u-")
  return url.origin === canonicalOrigin || legacyOrigin
    ? { origin: url.origin, slug }
    : null
}

async function startBrowserAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const target = publicReturn(url.searchParams.get("return_to"), env)
  if (!target) {
    throw new RelayHttpError(
      400,
      "invalid_request",
      "Invalid Relay sign-in return URL"
    )
  }
  const attempt = await createBrowserAuthorization(target.slug, env)
  const stored = await env.TUNNELS.getByName(target.slug).fetch(
    "https://relay.internal/_control/browser-auth/start",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: attempt.state,
        verifier: attempt.verifier,
      }),
    }
  )
  if (!stored.ok) return stored
  return redirect(attempt.authorizationUrl)
}

async function browserAuthCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url)
  const stateValue = url.searchParams.get("state")
  const slug = stateValue ? browserAuthStateSlug(stateValue) : null
  if (!stateValue || !slug) {
    return authPage(
      "Eidos sign-in could not be completed",
      "The Relay sign-in state is invalid. Open the Relay URL and try again.",
      400
    )
  }
  const stub = env.TUNNELS.getByName(slug)
  const consumed = await stub.fetch(
    "https://relay.internal/_control/browser-auth/consume",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: stateValue }),
    }
  )
  if (!consumed.ok) {
    return authPage(
      "Eidos sign-in expired",
      "Open the Relay URL and start again.",
      400
    )
  }
  const consumedValue = (await consumed.json()) as unknown
  const verifier =
    typeof consumedValue === "object" &&
    consumedValue !== null &&
    !Array.isArray(consumedValue)
      ? (consumedValue as Record<string, unknown>).verifier
      : null
  if (typeof verifier !== "string") {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Relay sign-in state is invalid"
    )
  }
  if (url.searchParams.has("error")) {
    return authPage(
      "Eidos sign-in was cancelled",
      "Open the Relay URL when you are ready to try again.",
      400
    )
  }
  const code = url.searchParams.get("code")
  if (!code) {
    return authPage(
      "Eidos sign-in could not be completed",
      "The account service did not return an authorization code.",
      400
    )
  }
  const principal = await exchangeBrowserAuthorization(code, verifier, env)
  const completed = await stub.fetch(
    "https://relay.internal/_control/browser-auth/complete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: principal.userId }),
    }
  )
  if (completed.status === 403) {
    return authPage(
      "Use the account that started this Relay",
      "This Relay belongs to a different Eidos account. Sign in with the account used by the CLI and try again.",
      403
    )
  }
  if (!completed.ok) return completed
  const completedValue = (await completed.json()) as unknown
  const ticket =
    typeof completedValue === "object" &&
    completedValue !== null &&
    !Array.isArray(completedValue)
      ? (completedValue as Record<string, unknown>).ticket
      : null
  if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(ticket)) {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Relay sign-in ticket is invalid"
    )
  }
  const callback = new URL(
    "/_eidos/auth/callback",
    browserPublicOrigin(slug, env)
  )
  callback.searchParams.set("ticket", ticket)
  return redirect(callback.toString(), 303)
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
        if (
          url.pathname === "/v1/browser-auth/start" &&
          request.method === "GET"
        ) {
          return await startBrowserAuth(request, env)
        }
        if (
          url.pathname === "/v1/browser-auth/callback" &&
          request.method === "GET"
        ) {
          return await browserAuthCallback(request, env)
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
