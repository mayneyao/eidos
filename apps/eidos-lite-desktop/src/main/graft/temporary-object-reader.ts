import fs from "node:fs/promises"
import path from "node:path"

import type {
  SpaceVersionTextContentDiff,
  SpaceVersionTextContentRequest,
  SpaceVersionTextContentState,
} from "../../shared/contracts"

const OBJECT_ID = /^[0-9a-f]{64}$/
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

interface RevisionDiffSource {
  diff(options: Record<string, unknown>): Promise<unknown>
}

interface ArtifactState {
  type: "file" | "large_file"
  kind: string
  oid: string
  contentHash: string
  size: number
}

interface ArtifactDiff {
  path: string
  from: ArtifactState | null
  to: ArtifactState | null
}

function normalizeHistoricalPath(value: string): string {
  if (!value || value.includes("\0") || path.isAbsolute(value)) {
    throw new Error("Path must be a non-empty Space-relative path")
  }
  const normalized = path.posix.normalize(value)
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Path escapes the Space")
  }
  if (normalized === ".") throw new Error("The Space root is not a text file")
  if (
    normalized
      .split("/")
      .some((component) => component.toLowerCase() === ".graft")
  ) {
    throw new Error("The .graft implementation directory is protected")
  }
  return normalized
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function objectId(value: unknown, label: string): string {
  if (typeof value !== "string" || !OBJECT_ID.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function artifactState(value: unknown): ArtifactState | null {
  if (value === null || value === undefined) return null
  const item = record(value)
  const type = item.type
  const size = item.size
  if (
    (type !== "file" && type !== "large_file") ||
    typeof item.kind !== "string" ||
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 0
  ) {
    throw new Error("Graft returned an invalid artifact state")
  }
  return {
    type,
    kind: item.kind,
    oid: objectId(item.oid, "artifact object id"),
    contentHash: objectId(item.content_hash, "artifact content hash"),
    size,
  }
}

function artifactDiff(value: unknown, requestedPath: string): ArtifactDiff {
  const artifacts = record(value).artifacts
  if (!Array.isArray(artifacts)) {
    throw new Error("Graft did not return artifact changes")
  }
  const match = artifacts
    .map(record)
    .find((item) => item.path === requestedPath)
  if (!match) {
    throw new Error(`No text change was recorded for ${requestedPath}`)
  }
  return {
    path: requestedPath,
    from: artifactState(match.from),
    to: artifactState(match.to),
  }
}

function decodeBase58(value: string): Uint8Array {
  if (!value) return new Uint8Array()
  const bytes = [0]
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character)
    if (digit < 0) throw new Error("Invalid legacy Graft file encoding")
    let carry = digit
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index]! * 58
      bytes[index] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (
    let index = 0;
    value[index] === "1" && index < value.length - 1;
    index += 1
  ) {
    bytes.push(0)
  }
  return Uint8Array.from(bytes.reverse())
}

function parseCanonicalBlob(bytes: Uint8Array): Uint8Array {
  const nul = bytes.indexOf(0)
  if (nul < 0) throw new Error("Invalid Graft object header")
  const header = Buffer.from(bytes.subarray(0, nul)).toString("utf8")
  const match = /^graft-object 1 blob ([0-9]+)$/.exec(header)
  if (!match) throw new Error("Unsupported Graft object")
  const expectedLength = Number(match[1])
  const payload = bytes.subarray(nul + 1)
  if (
    !Number.isSafeInteger(expectedLength) ||
    payload.length !== expectedLength
  ) {
    throw new Error("Invalid Graft object payload length")
  }
  return payload
}

function parseInlineFile(payload: Uint8Array): {
  kind: string
  bytes: Uint8Array
} {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(payload)
  const lines = text.split("\n")
  const version = lines.shift()
  if (version !== "file-blob-v1" && version !== "file-blob-v2") {
    throw new Error("Graft object is not a file blob")
  }
  const fields = new Map<string, string>()
  for (const line of lines) {
    if (!line) continue
    const separator = line.indexOf(" ")
    if (separator <= 0) throw new Error("Invalid Graft file blob")
    fields.set(line.slice(0, separator), line.slice(separator + 1))
  }
  const kind = fields.get("kind")
  const declaredSize = Number(fields.get("size"))
  const encoded = fields.get("data")
  if (
    !kind ||
    !Number.isSafeInteger(declaredSize) ||
    declaredSize < 0 ||
    encoded === undefined
  ) {
    throw new Error("Incomplete Graft file blob")
  }
  if (version === "file-blob-v2" && fields.get("encoding") !== "base64") {
    throw new Error("Unsupported Graft file encoding")
  }
  const decoded =
    version === "file-blob-v2" ? decodeBase64(encoded) : decodeBase58(encoded)
  if (decoded.length !== declaredSize) {
    throw new Error("Graft file size does not match its object")
  }
  return { kind, bytes: decoded }
}

function decodeBase64(value: string): Uint8Array {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value
    )
  ) {
    throw new Error("Invalid Graft file data encoding")
  }
  return Buffer.from(value, "base64")
}

async function readBoundedFile(
  filePath: string,
  maximumStoredBytes: number
): Promise<Uint8Array> {
  const stats = await fs.lstat(filePath)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("Graft content is not a regular file")
  }
  if (stats.size > maximumStoredBytes) {
    throw new Error("Graft object exceeds the bounded reader limit")
  }
  return fs.readFile(filePath)
}

function utf8State(
  bytes: Uint8Array,
  state: ArtifactState
): SpaceVersionTextContentState {
  try {
    return {
      state: "utf8",
      content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      size: bytes.length,
      contentHash: state.contentHash,
    }
  } catch {
    return {
      state: "invalid_utf8",
      size: bytes.length,
      contentHash: state.contentHash,
    }
  }
}

async function readArtifactContent(
  root: string,
  state: ArtifactState | null,
  maxBytes: number
): Promise<SpaceVersionTextContentState> {
  if (!state) return { state: "absent" }
  if (state.size > maxBytes) {
    return {
      state: "too_large",
      size: state.size,
      contentHash: state.contentHash,
    }
  }
  if (state.kind !== "text_file") {
    return {
      state: "invalid_utf8",
      size: state.size,
      contentHash: state.contentHash,
    }
  }

  if (state.type === "large_file") {
    const payloadPath = path.join(
      root,
      ".graft",
      "store",
      "files",
      state.contentHash.slice(0, 2),
      state.contentHash.slice(2)
    )
    try {
      const bytes = await readBoundedFile(payloadPath, maxBytes)
      if (bytes.length !== state.size) {
        throw new Error("Graft payload size does not match its pointer")
      }
      return utf8State(bytes, state)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          state: "missing_payload",
          size: state.size,
          contentHash: state.contentHash,
        }
      }
      throw error
    }
  }

  const objectPath = path.join(
    root,
    ".graft",
    "objects",
    state.oid.slice(0, 2),
    state.oid.slice(2)
  )
  const objectBytes = await readBoundedFile(objectPath, maxBytes * 2 + 8_192)
  const file = parseInlineFile(parseCanonicalBlob(objectBytes))
  if (file.kind !== "text_file" || file.bytes.length !== state.size) {
    throw new Error("Graft artifact metadata does not match its object")
  }
  return utf8State(file.bytes, state)
}

/**
 * Temporary bridge for unpublished SDK candidates that expose artifact ids but
 * not bounded path content. Remove this module once readPathContent is public.
 */
export async function readTemporaryRevisionTextDiff(
  repository: RevisionDiffSource,
  root: string,
  request: SpaceVersionTextContentRequest
): Promise<SpaceVersionTextContentDiff> {
  objectId(request.commitId, "checkpoint id")
  if (request.parentId) objectId(request.parentId, "checkpoint parent id")
  const relativePath = normalizeHistoricalPath(request.path)
  if (
    !Number.isSafeInteger(request.maxBytes) ||
    request.maxBytes < 1 ||
    request.maxBytes > 1024 * 1024
  ) {
    throw new Error("Invalid version text content limit")
  }
  const rawDiff = await repository.diff(
    request.parentId
      ? {
          from: request.parentId,
          to: request.commitId,
          path: relativePath,
          rows: false,
        }
      : { root: request.commitId, path: relativePath, rows: false }
  )
  const artifact = artifactDiff(rawDiff, relativePath)
  const [before, after] = await Promise.all([
    readArtifactContent(root, artifact.from, request.maxBytes),
    readArtifactContent(root, artifact.to, request.maxBytes),
  ])
  return { path: relativePath, before, after }
}
