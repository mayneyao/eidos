const IDENTITY_RESPONSE_BYTES_MAX = 16 * 1024
const BEARER_TOKEN_BYTES_MAX = 8 * 1024

export interface RelayPrincipal {
  userId: string
}

export class RelayHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "RelayHttpError"
  }
}

function bearerAuthorization(request: Request): string {
  const value = request.headers.get("authorization")
  if (
    value === null ||
    !value.startsWith("Bearer ") ||
    value.length <= "Bearer ".length ||
    value.length > BEARER_TOKEN_BYTES_MAX ||
    /[\r\n]/u.test(value)
  ) {
    throw new RelayHttpError(401, "unauthorized", "Sign in to Eidos first")
  }
  return value
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > IDENTITY_RESPONSE_BYTES_MAX
  ) {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos identity response is too large"
    )
  }
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > IDENTITY_RESPONSE_BYTES_MAX) {
      await reader.cancel()
      throw new RelayHttpError(
        503,
        "identity_unavailable",
        "The Eidos identity response is too large"
      )
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos identity response is invalid"
    )
  }
}

function identity(value: unknown): RelayPrincipal {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos identity response is invalid"
    )
  }
  const userId = (value as Record<string, unknown>).sub
  if (
    typeof userId !== "string" ||
    userId.length === 0 ||
    userId.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(userId)
  ) {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos identity response is invalid"
    )
  }
  return { userId }
}

export async function authenticateEidosUser(
  request: Request,
  env: Env
): Promise<RelayPrincipal> {
  const authorization = bearerAuthorization(request)
  let endpoint: URL
  try {
    endpoint = new URL(env.AUTH_USERINFO_URL)
  } catch {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos identity endpoint is invalid"
    )
  }
  if (endpoint.protocol !== "https:") {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos identity endpoint is invalid"
    )
  }
  let response: Response
  try {
    response = await env.EIDOS_ACCOUNT.fetch(
      new Request(endpoint, {
        headers: {
          Accept: "application/json",
          Authorization: authorization,
        },
        redirect: "manual",
      })
    )
  } catch {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos identity service is unavailable"
    )
  }
  if (response.status === 401 || response.status === 403) {
    throw new RelayHttpError(401, "unauthorized", "Sign in to Eidos first")
  }
  if (!response.ok) {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos identity service is unavailable"
    )
  }
  return identity(await boundedJson(response))
}

export async function relaySlug(userId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId))
  )
  return `u-${[...digest.subarray(0, 10)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`
}
