import { EidosFileError } from "./errors"

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function sqliteNoCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase())
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function isEidosFileUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V7.test(value)
}

export function assertEidosFileUuid(value: string, label = "ID"): string {
  if (!isEidosFileUuid(value)) {
    throw new EidosFileError(
      "invalid-value",
      `${label} must be a lowercase hyphenated UUIDv7`
    )
  }
  return value
}

function bytesToUuid(value: Uint8Array): string {
  const hex = Array.from(value, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  return assertEidosFileUuid(uuid)
}

let lastUuidV7Timestamp = -1
let lastUuidV7Bytes: Uint8Array | undefined

function incrementUuidV7Random(bytes: Uint8Array): boolean {
  for (let index = 15; index >= 9; index -= 1) {
    if (bytes[index]! < 0xff) {
      bytes[index] = bytes[index]! + 1
      return true
    }
    bytes[index] = 0
  }
  const variantRandom = bytes[8]! & 0x3f
  if (variantRandom < 0x3f) {
    bytes[8] = 0x80 | (variantRandom + 1)
    return true
  }
  bytes[8] = 0x80
  if (bytes[7]! < 0xff) {
    bytes[7] = bytes[7]! + 1
    return true
  }
  bytes[7] = 0
  const versionRandom = bytes[6]! & 0x0f
  if (versionRandom < 0x0f) {
    bytes[6] = 0x70 | (versionRandom + 1)
    return true
  }
  return false
}

/** Runtime-epoch UUIDv7 allocator with injected time and secure entropy. */
export class EidosUuidV7Generator {
  private lastTimestamp: number | undefined
  private lastBytes: Uint8Array | undefined

  constructor(
    private readonly nowInstant: () => string,
    private readonly randomBytes: (length: number) => Uint8Array
  ) {}

  next(): string {
    const wallInstant = this.nowInstant()
    const wallTimestamp = Date.parse(wallInstant)
    if (
      !Number.isSafeInteger(wallTimestamp) ||
      wallTimestamp < 0 ||
      wallTimestamp > 0xffffffffffff
    ) {
      throw new EidosFileError(
        "resource-limit",
        "Wall clock cannot be encoded as a UUIDv7 timestamp"
      )
    }
    const timestamp =
      this.lastTimestamp === undefined
        ? wallTimestamp
        : Math.max(wallTimestamp, this.lastTimestamp)
    let bytes: Uint8Array
    if (this.lastBytes && timestamp === this.lastTimestamp) {
      bytes = this.lastBytes.slice()
      if (!incrementUuidV7Random(bytes)) {
        throw new EidosFileError(
          "resource-limit",
          "UUIDv7 monotonic payload was exhausted for one millisecond"
        )
      }
    } else {
      const supplied = this.randomBytes(16)
      if (!(supplied instanceof Uint8Array) || supplied.byteLength !== 16) {
        throw new EidosFileError(
          "resource-limit",
          "EntropyPort must return exactly the requested owned bytes"
        )
      }
      bytes = supplied.slice()
    }
    let remaining = timestamp
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = remaining % 256
      remaining = Math.floor(remaining / 256)
    }
    bytes[6] = 0x70 | (bytes[6]! & 0x0f)
    bytes[8] = 0x80 | (bytes[8]! & 0x3f)
    this.lastTimestamp = timestamp
    this.lastBytes = bytes.slice()
    return bytesToUuid(bytes)
  }
}

/** Creates an RFC 9562 UUIDv7 using the current Unix millisecond timestamp. */
export function createEidosFileUuid(timestamp = Date.now()): string {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > 0xffffffffffff
  ) {
    throw new EidosFileError(
      "invalid-value",
      "UUIDv7 timestamp is out of range"
    )
  }
  const bytes =
    timestamp === lastUuidV7Timestamp && lastUuidV7Bytes
      ? new Uint8Array(lastUuidV7Bytes)
      : globalThis.crypto.getRandomValues(new Uint8Array(16))
  if (
    timestamp === lastUuidV7Timestamp &&
    lastUuidV7Bytes &&
    !incrementUuidV7Random(bytes)
  ) {
    throw new EidosFileError(
      "resource-limit",
      "UUIDv7 monotonic random space was exhausted for one millisecond"
    )
  }
  let time = timestamp
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = time % 256
    time = Math.floor(time / 256)
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f)
  bytes[8] = 0x80 | (bytes[8]! & 0x3f)
  lastUuidV7Timestamp = timestamp
  lastUuidV7Bytes = new Uint8Array(bytes)
  return bytesToUuid(bytes)
}

/** @deprecated Use UUID strings as stable public identifiers. */
export function createEidosFileIdentifier(): string {
  return createEidosFileUuid()
}

/** UUIDs are the only valid Table IDs in Eidos File 1.0. */
export function assertEidosFileTableId(tableId: string): string {
  return assertEidosFileUuid(tableId, "Table ID")
}

export function assertEidosFileDisplayName(
  name: string,
  label: string
): string {
  if (
    name.length === 0 ||
    name.includes("\u0000") ||
    utf8Length(name) > 1024 ||
    /[\uD800-\uDFFF]/u.test(
      Array.from(name)
        .filter((scalar) => scalar.length === 1)
        .join("")
    )
  ) {
    throw new EidosFileError(
      "invalid-identifier",
      `${label} must be 1..1024 UTF-8 octets, contain Unicode scalar values, and exclude U+0000`
    )
  }
  return name
}

export function isEidosFileReservedTableName(name: string): boolean {
  const folded = sqliteNoCase(name)
  return folded.startsWith("sqlite_") || folded.startsWith("eidos__")
}

export function assertEidosFileTableName(name: string): string {
  assertEidosFileDisplayName(name, "Table name")
  if (isEidosFileReservedTableName(name)) {
    throw new EidosFileError(
      "invalid-identifier",
      "Table name must not begin with sqlite_ or eidos__"
    )
  }
  return name
}

/** @deprecated Field display names are not restricted to bare SQL tokens. */
export function assertEidosFileColumnName(columnName: string): string {
  return assertEidosFileDisplayName(columnName, "Field name")
}

export function quoteIdentifier(identifier: string): string {
  if (identifier.includes("\u0000")) {
    throw new EidosFileError(
      "invalid-identifier",
      "SQLite identifiers must not contain U+0000"
    )
  }
  return `"${identifier.replace(/"/g, '""')}"`
}
