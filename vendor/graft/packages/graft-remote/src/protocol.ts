import type { GraftByteRange, GraftListQuery } from "./types.js";

export const PROTOCOL_HEADER = "Graft-Protocol";
export const PROTOCOL_VERSION = "1";
export const MAX_METADATA_BYTES = 16 * 1024;
export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 500;
export const GRAFT_REMOTE_CAPABILITIES = [
  "range",
  "list",
  "list-cursor",
  "put-if-absent",
  "receive-pack",
  "cas",
  "cad",
] as const;

const MAX_OBJECT_PATH_BYTES = 768;
export const RECEIVE_PACK_ID_BYTES = 64;
export const RECEIVE_PACK_HEADER_PACK_ID = "x-graft-pack-id";
export const RECEIVE_PACK_HEADER_PACK_BYTES = "x-graft-pack-bytes";
export const RECEIVE_PACK_HEADER_INDEX_BYTES = "x-graft-index-bytes";
export const RECEIVE_PACK_HEADER_REPLACEMENT_HEX = "x-graft-ref-replacement-hex";
const REPOSITORY_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

interface ListCursor {
  version: 1;
  prefix: string;
  after: string;
}

export class GraftProtocolError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers?: HeadersInit;

  constructor(status: number, code: string, message: string, headers?: HeadersInit) {
    super(message);
    this.name = "GraftProtocolError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export function validateRepositorySegment(value: string): string {
  if (!REPOSITORY_SEGMENT.test(value)) {
    throw new GraftProtocolError(
      400,
      "invalid_repository",
      "Repository namespace and name must use letters, digits, '.', '_' or '-'",
    );
  }
  return value;
}

export function validateEncodedPath(url: URL): void {
  if (/%(?![0-9A-Fa-f]{2})/.test(url.pathname)) {
    throw new GraftProtocolError(400, "invalid_path", "Path contains invalid percent encoding");
  }
  if (/%(?:2f|5c)/i.test(url.pathname)) {
    throw new GraftProtocolError(
      400,
      "invalid_path",
      "Encoded slash and backslash characters are not allowed",
    );
  }
}

export function validateObjectPath(path: string): string {
  if (encoder.encode(path).byteLength > MAX_OBJECT_PATH_BYTES) {
    throw new GraftProtocolError(414, "object_path_too_long", "Object path is too long");
  }
  const segments = path.split("/");
  for (const segment of segments) {
    validatePathSegment(segment);
  }
  if (path === "locks" || path.startsWith("locks/")) {
    throw new GraftProtocolError(400, "reserved_object_path", "The locks namespace is reserved");
  }
  return path;
}

export function validateObjectPrefix(prefix: string): string {
  if (prefix === "") {
    return prefix;
  }
  if (encoder.encode(prefix).byteLength > MAX_OBJECT_PATH_BYTES) {
    throw new GraftProtocolError(414, "object_path_too_long", "Object prefix is too long");
  }
  const segments = prefix.split("/");
  const last = segments.at(-1);
  for (const [index, segment] of segments.entries()) {
    if (segment === "" && index === segments.length - 1 && last === "") {
      continue;
    }
    validatePathSegment(segment);
  }
  if (prefix === "locks" || prefix.startsWith("locks/")) {
    throw new GraftProtocolError(400, "reserved_object_path", "The locks namespace is reserved");
  }
  return prefix;
}

export function validateListQuery(url: URL): GraftListQuery {
  for (const key of url.searchParams.keys()) {
    if (key !== "prefix" && key !== "cursor" && key !== "limit") {
      throw new GraftProtocolError(
        400,
        "invalid_query",
        `Unsupported list query parameter: ${key}`,
      );
    }
  }
  for (const key of ["prefix", "cursor", "limit"]) {
    if (url.searchParams.getAll(key).length > 1) {
      throw new GraftProtocolError(
        400,
        "invalid_query",
        `List query parameter is repeated: ${key}`,
      );
    }
  }

  const encodedCursor = url.searchParams.get("cursor");
  const cursor = encodedCursor === null ? undefined : decodeListCursor(encodedCursor);
  const requestedPrefix = url.searchParams.get("prefix");
  const prefix = validateObjectPrefix(requestedPrefix ?? cursor?.prefix ?? "");
  if (cursor !== undefined && cursor.prefix !== prefix) {
    throw new GraftProtocolError(
      400,
      "invalid_list_cursor",
      "The list cursor does not belong to the requested prefix",
    );
  }

  const limitText = url.searchParams.get("limit");
  const limit = limitText === null ? DEFAULT_LIST_LIMIT : Number(limitText);
  if (
    (limitText !== null && !/^[1-9]\d*$/.test(limitText)) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIST_LIMIT
  ) {
    throw new GraftProtocolError(
      400,
      "invalid_list_limit",
      `List limit must be an integer between 1 and ${MAX_LIST_LIMIT}`,
    );
  }
  return { prefix, after: cursor?.after, limit };
}

export function encodeListCursor(prefix: string, after: string): string {
  const payload: ListCursor = { version: 1, prefix, after };
  const bytes = encoder.encode(JSON.stringify(payload));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function rejectUnexpectedQuery(url: URL): void {
  if ([...url.searchParams.keys()].length !== 0) {
    throw new GraftProtocolError(
      400,
      "invalid_query",
      "This operation does not accept query parameters",
    );
  }
}

export function isTransactionalPath(path: string): boolean {
  return path === "HEAD" || path.startsWith("refs/");
}

export function isImmutablePath(path: string): boolean {
  return !isTransactionalPath(path);
}

export function parseExpectedHeaders(headers: Headers): Uint8Array<ArrayBuffer> | undefined {
  const present = headers.get("x-graft-expected-present");
  const hex = headers.get("x-graft-expected-hex");
  if (present !== "true" && present !== "false") {
    throw new GraftProtocolError(
      400,
      "invalid_expected_value",
      "x-graft-expected-present must be 'true' or 'false'",
    );
  }
  if (hex === null) {
    throw new GraftProtocolError(400, "invalid_expected_value", "x-graft-expected-hex is required");
  }
  if (present === "false") {
    if (hex !== "") {
      throw new GraftProtocolError(
        400,
        "invalid_expected_value",
        "x-graft-expected-hex must be empty when the expected object is absent",
      );
    }
    return undefined;
  }
  if (hex.length > MAX_METADATA_BYTES * 2 || hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) {
    throw new GraftProtocolError(
      400,
      "invalid_expected_value",
      "x-graft-expected-hex must be lowercase hexadecimal within the metadata size limit",
    );
  }
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function parseReceivePackHeaders(headers: Headers): {
  packId: string;
  packBytes: number;
  indexBytes: number;
  replacement: Uint8Array<ArrayBuffer>;
} {
  const packId = headers.get(RECEIVE_PACK_HEADER_PACK_ID);
  if (packId === null || !new RegExp(`^[0-9a-f]{${RECEIVE_PACK_ID_BYTES}}$`).test(packId)) {
    throw new GraftProtocolError(
      400,
      "invalid_receive_pack",
      `${RECEIVE_PACK_HEADER_PACK_ID} must be a lowercase ${RECEIVE_PACK_ID_BYTES}-character object id`,
    );
  }
  const packBytes = parseLengthHeader(headers, RECEIVE_PACK_HEADER_PACK_BYTES);
  const indexBytes = parseLengthHeader(headers, RECEIVE_PACK_HEADER_INDEX_BYTES);
  const replacementHex = headers.get(RECEIVE_PACK_HEADER_REPLACEMENT_HEX);
  if (replacementHex === null) {
    throw new GraftProtocolError(
      400,
      "invalid_receive_pack",
      `${RECEIVE_PACK_HEADER_REPLACEMENT_HEX} is required`,
    );
  }
  const replacement = decodeLowerHex(replacementHex, RECEIVE_PACK_HEADER_REPLACEMENT_HEX);
  return { packId, packBytes, indexBytes, replacement };
}

function parseLengthHeader(headers: Headers, name: string): number {
  const value = headers.get(name);
  if (value === null || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new GraftProtocolError(
      400,
      "invalid_receive_pack",
      `${name} must be a non-negative decimal integer`,
    );
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw new GraftProtocolError(413, "receive_pack_too_large", `${name} exceeds the safe limit`);
  }
  return length;
}

function decodeLowerHex(value: string, name: string): Uint8Array<ArrayBuffer> {
  if (
    value.length > MAX_METADATA_BYTES * 2 ||
    value.length % 2 !== 0 ||
    !/^[0-9a-f]*$/.test(value)
  ) {
    throw new GraftProtocolError(
      400,
      "invalid_receive_pack",
      `${name} must be lowercase hexadecimal within the metadata size limit`,
    );
  }
  const bytes = new Uint8Array(new ArrayBuffer(value.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function readLimitedBody(
  request: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new GraftProtocolError(400, "invalid_content_length", "Invalid Content-Length header");
    }
    if (length > limit) {
      throw new GraftProtocolError(413, "metadata_too_large", `Metadata exceeds ${limit} bytes`);
    }
  }

  if (request.body === null) {
    return new Uint8Array(new ArrayBuffer(0));
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      total += result.value.byteLength;
      if (total > limit) {
        await reader.cancel("metadata size limit exceeded");
        throw new GraftProtocolError(413, "metadata_too_large", `Metadata exceeds ${limit} bytes`);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function parseRangeHeader(value: string | null, size: number): GraftByteRange | undefined {
  if (value === null) {
    return undefined;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (match === null || (match[1] === "" && match[2] === "")) {
    throw rangeNotSatisfiable(size);
  }
  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (startText === "") {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) {
      throw rangeNotSatisfiable(size);
    }
    const length = Math.min(suffix, size);
    return { start: size - length, end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText === "" ? size - 1 : Number(endText);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) {
    throw rangeNotSatisfiable(size);
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export function protocolHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set(PROTOCOL_HEADER, PROTOCOL_VERSION);
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function emptyResponse(status = 204, initial?: HeadersInit): Response {
  return new Response(null, { status, headers: protocolHeaders(initial) });
}

export function jsonResponse(value: unknown, status = 200, initial?: HeadersInit): Response {
  const headers = protocolHeaders(initial);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return Response.json(value, { status, headers });
}

export function errorResponse(error: unknown): Response {
  const protocolError =
    error instanceof GraftProtocolError
      ? error
      : new GraftProtocolError(500, "internal_error", "Internal server error");
  const headers = protocolHeaders(protocolError.headers);
  headers.set("Content-Type", "application/problem+json; charset=utf-8");
  return Response.json(
    {
      type: `https://graft.rs/problems/${protocolError.code}`,
      title: protocolError.code,
      status: protocolError.status,
      detail: protocolError.message,
    },
    { status: protocolError.status, headers },
  );
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function bytewiseCompare(left: string, right: string): number {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.byteLength, rightBytes.byteLength);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return leftBytes.byteLength - rightBytes.byteLength;
}

function decodeListCursor(value: string): ListCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error("invalid base64url");
    }
    const padded = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(decoder.decode(bytes));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as Partial<ListCursor>).version !== 1 ||
      typeof (parsed as Partial<ListCursor>).prefix !== "string" ||
      typeof (parsed as Partial<ListCursor>).after !== "string"
    ) {
      throw new Error("invalid cursor payload");
    }
    const cursor = parsed as ListCursor;
    validateObjectPrefix(cursor.prefix);
    validateObjectPath(cursor.after);
    return cursor;
  } catch {
    throw new GraftProtocolError(400, "invalid_list_cursor", "Invalid list cursor");
  }
}

function validatePathSegment(segment: string): void {
  if (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(segment)
  ) {
    throw new GraftProtocolError(400, "invalid_path", "Invalid object path segment");
  }
}

function rangeNotSatisfiable(size: number): GraftProtocolError {
  return new GraftProtocolError(416, "range_not_satisfiable", "Range not satisfiable", {
    "Content-Range": `bytes */${size}`,
  });
}
