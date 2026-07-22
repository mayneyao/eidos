/** JSON values accepted by the Eidos 1.0 public protocols. */
export interface JsonObject {
  [key: string]: JsonValue
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | JsonObject

/**
 * An immutable, independently owned octet sequence at a public boundary.
 * Implementations copy on ingress/egress; callers must treat this value as
 * immutable even though JavaScript's Uint8Array type itself is mutable.
 */
export type OwnedBytes = Uint8Array

export interface CancellationSignal {
  readonly aborted: boolean
  onAbort(callback: () => void): () => void
}

export interface CancellationPort {
  cancelled(): boolean
  onCancel(callback: () => void): () => void
}

export interface RequestContext {
  requestId: string
  deadlineMilliseconds?: number
  signal?: CancellationSignal
}

export interface PublicationContext {
  cancellation: CancellationPort
  deadlineMilliseconds?: number
}

export interface ByteSource {
  size: string
  read(
    offset: string,
    length: number,
    context: PublicationContext
  ): Promise<OwnedBytes>
}

export interface ClockPort {
  nowInstant(): string
  nowMilliseconds(): number
}

export interface EntropyPort {
  randomBytes(length: number): OwnedBytes
}

export function cancellationPortFromSignal(
  signal?: CancellationSignal
): CancellationPort {
  return {
    cancelled: () => signal?.aborted === true,
    onCancel: (callback) => signal?.onAbort(callback) ?? (() => undefined),
  }
}

export class MemoryByteSource implements ByteSource {
  readonly size: string
  private released = false
  private readonly bytes: Uint8Array

  constructor(bytes: Uint8Array | ArrayBuffer) {
    this.bytes = new Uint8Array(
      bytes instanceof Uint8Array ? bytes.slice().buffer : bytes.slice(0)
    )
    this.size = String(this.bytes.byteLength)
  }

  async read(
    offset: string,
    length: number,
    context: PublicationContext
  ): Promise<OwnedBytes> {
    if (this.released) {
      throw byteSourceError(
        "adapter-closed",
        "ByteSource was released",
        false,
        true
      )
    }
    if (
      context.deadlineMilliseconds !== undefined &&
      (!Number.isSafeInteger(context.deadlineMilliseconds) ||
        context.deadlineMilliseconds < 1)
    ) {
      throw byteSourceError(
        "invalid-argument",
        "deadlineMilliseconds must be a positive safe integer"
      )
    }
    if (context.cancellation.cancelled()) {
      throw byteSourceError("cancelled", "ByteSource read was cancelled")
    }
    let start: bigint
    try {
      start = parseNonNegativeInt64(offset, "offset")
    } catch (error) {
      throw byteSourceError(
        "invalid-argument",
        error instanceof Error ? error.message : "Invalid ByteSource offset"
      )
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      throw byteSourceError(
        "invalid-argument",
        "length must be a non-negative safe integer"
      )
    }
    if (start > BigInt(this.bytes.byteLength)) {
      throw byteSourceError(
        "invalid-argument",
        "offset exceeds ByteSource size"
      )
    }
    const available = BigInt(this.bytes.byteLength) - start
    const count = Number(
      available < BigInt(length) ? available : BigInt(length)
    )
    return this.bytes.slice(Number(start), Number(start) + count)
  }

  release(): void {
    this.released = true
  }
}

function byteSourceError(
  code: "adapter-closed" | "invalid-argument" | "cancelled",
  message: string,
  retryable = false,
  fatal = false
): Error & {
  code: typeof code
  retryable: boolean
  fatal: boolean
} {
  return Object.assign(new Error(message), {
    name: "EidosAdapterError",
    code,
    retryable,
    fatal,
  })
}

export function parseNonNegativeInt64(value: string, label: string): bigint {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new RangeError(`${label} must be a canonical non-negative int64`)
  }
  const parsed = BigInt(value)
  if (parsed > 9_223_372_036_854_775_807n) {
    throw new RangeError(`${label} exceeds int64`)
  }
  return parsed
}
