export const RELAY_PROTOCOL_VERSION = 1 as const
export const RELAY_REQUEST_BYTES_MAX = 4 * 1024 * 1024
export const RELAY_RESPONSE_CHUNK_BYTES_MAX = 128 * 1024
export const RELAY_CONCURRENT_REQUESTS_MAX = 32

export interface RelayRequestMessage {
  v: typeof RELAY_PROTOCOL_VERSION
  type: "request"
  id: string
  method: string
  path: string
  headers: Array<[string, string]>
  body?: string
}

export interface RelayCancelMessage {
  v: typeof RELAY_PROTOCOL_VERSION
  type: "request.cancel"
  id: string
}

export interface RelayResponseStartMessage {
  v: typeof RELAY_PROTOCOL_VERSION
  type: "response.start"
  id: string
  status: number
  headers: Array<[string, string]>
}

export interface RelayResponseBodyMessage {
  v: typeof RELAY_PROTOCOL_VERSION
  type: "response.body"
  id: string
  body: string
}

export interface RelayResponseEndMessage {
  v: typeof RELAY_PROTOCOL_VERSION
  type: "response.end"
  id: string
}

export interface RelayResponseErrorMessage {
  v: typeof RELAY_PROTOCOL_VERSION
  type: "response.error"
  id: string
  message?: string
}

export type RelayConnectorMessage =
  | RelayResponseStartMessage
  | RelayResponseBodyMessage
  | RelayResponseEndMessage
  | RelayResponseErrorMessage

const REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "cache-control",
  "content-type",
  "if-modified-since",
  "if-none-match",
  "x-eidos-client-id",
])

const RESPONSE_HEADERS = new Set([
  "cache-control",
  "content-disposition",
  "content-type",
  "etag",
  "last-modified",
  "x-content-type-options",
])

export function forwardedRequestHeaders(
  headers: Headers
): Array<[string, string]> {
  return [...headers]
    .filter(([name]) => REQUEST_HEADERS.has(name.toLowerCase()))
    .map(([name, value]) => [name, value])
}

export function forwardedResponseHeaders(
  headers: Array<[string, string]>
): Headers {
  const result = new Headers()
  for (const member of headers) {
    if (
      !Array.isArray(member) ||
      member.length !== 2 ||
      typeof member[0] !== "string" ||
      typeof member[1] !== "string" ||
      member[0].length > 128 ||
      member[1].length > 8 * 1024 ||
      !RESPONSE_HEADERS.has(member[0].toLowerCase()) ||
      /[\r\n]/u.test(member[0]) ||
      /[\r\n]/u.test(member[1])
    ) {
      continue
    }
    result.append(member[0], member[1])
  }
  result.set("X-Content-Type-Options", "nosniff")
  return result
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array | null {
  if (value.length > Math.ceil(RELAY_RESPONSE_CHUNK_BYTES_MAX / 3) * 4 + 8) {
    return null
  }
  try {
    const binary = atob(value)
    if (binary.length > RELAY_RESPONSE_CHUNK_BYTES_MAX) return null
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

export function connectorMessage(value: unknown): RelayConnectorMessage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }
  const message = value as Record<string, unknown>
  if (
    message.v !== RELAY_PROTOCOL_VERSION ||
    typeof message.type !== "string" ||
    typeof message.id !== "string" ||
    !/^[0-9a-f-]{36}$/u.test(message.id)
  ) {
    return null
  }
  if (message.type === "response.start") {
    if (
      typeof message.status !== "number" ||
      !Number.isInteger(message.status) ||
      message.status < 200 ||
      message.status > 599 ||
      !Array.isArray(message.headers) ||
      message.headers.length > 32
    ) {
      return null
    }
    return message as unknown as RelayResponseStartMessage
  }
  if (message.type === "response.body") {
    return typeof message.body === "string"
      ? (message as unknown as RelayResponseBodyMessage)
      : null
  }
  if (message.type === "response.end") {
    return message as unknown as RelayResponseEndMessage
  }
  if (message.type === "response.error") {
    return message.message === undefined ||
      (typeof message.message === "string" && message.message.length <= 1024)
      ? (message as unknown as RelayResponseErrorMessage)
      : null
  }
  return null
}
