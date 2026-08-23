export interface FormSubmissionIntentClaims {
  iss: "eidos-publish-form"
  aud: string
  tenantId: string
  publicationId: string
  publicationVersionId: string
  accessRevision: number
  submissionRevision: number
  nonce: string
  iat: number
  exp: number
  kid: "v1"
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export async function signFormSubmissionIntent(
  claims: FormSubmissionIntentClaims,
  secret: string
): Promise<string> {
  requireSecret(secret)
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)))
  const signature = await hmac(payload, secret)
  return `${payload}.${base64UrlEncode(signature)}`
}

export async function verifyFormSubmissionIntent(
  token: string,
  secret: string,
  audience: string,
  now = Math.floor(Date.now() / 1000)
): Promise<FormSubmissionIntentClaims | null> {
  requireSecret(secret)
  const parts = token.split(".")
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) return null
  const [payload, signature] = parts as [string, string]
  let decodedSignature: Uint8Array
  let value: unknown
  try {
    decodedSignature = base64UrlDecode(signature)
    value = JSON.parse(decoder.decode(base64UrlDecode(payload))) as unknown
  } catch {
    return null
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  )
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      key,
      decodedSignature.slice().buffer,
      encoder.encode(payload)
    )) ||
    !validClaims(value, audience, now)
  ) {
    return null
  }
  return value
}

function validClaims(
  value: unknown,
  audience: string,
  now: number
): value is FormSubmissionIntentClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const claims = value as Record<string, unknown>
  return (
    Object.keys(claims).length === 11 &&
    claims.iss === "eidos-publish-form" &&
    claims.kid === "v1" &&
    claims.aud === audience &&
    typeof claims.tenantId === "string" &&
    typeof claims.publicationId === "string" &&
    typeof claims.publicationVersionId === "string" &&
    typeof claims.nonce === "string" &&
    /^[A-Za-z0-9_-]{22,64}$/.test(claims.nonce) &&
    Number.isSafeInteger(claims.accessRevision) &&
    (claims.accessRevision as number) >= 0 &&
    Number.isSafeInteger(claims.submissionRevision) &&
    (claims.submissionRevision as number) >= 0 &&
    Number.isSafeInteger(claims.iat) &&
    Number.isSafeInteger(claims.exp) &&
    (claims.iat as number) <= now + 60 &&
    (claims.exp as number) > now &&
    (claims.exp as number) - (claims.iat as number) <= 30 * 60
  )
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value))
  )
}

function requireSecret(secret: string): void {
  if (encoder.encode(secret).byteLength < 32) {
    throw new Error("PUBLISH_FORM_INTENT_SECRET is not configured")
  }
}

function base64UrlEncode(value: Uint8Array): string {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url")
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
