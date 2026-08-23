import { canonicalJson, canonicalJsonBytes, canonicalSha256 } from "./canonical"
import type {
  EidosDriverDescriptor,
  FormDriverDescriptor,
  MarkdownDriverDescriptor,
  PublishDriverDescriptor,
  SourceBundleAssetReference,
  SourceBundleFile,
  SourceBundleManifest,
  ValidatedSourceBundle,
} from "./contracts"

const encoder = new TextEncoder()
const DECIMAL = /^(?:0|[1-9][0-9]*)$/
const SHA256 = /^[0-9a-f]{64}$/
const MEDIA_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CONTROL = /[\u0000-\u001f\u007f]/
const MAX_ASSET_REFERENCES = 50_000

export const EIDOS_DRIVER: EidosDriverDescriptor = {
  id: "org.eidos.driver.eidos",
  version: "1.0",
  acceptedMediaTypes: ["application/vnd.eidos+sqlite3"],
  targetKinds: ["runtime"],
  runtimeProfile: "eidos-serve-publish/1",
  limits: {
    maxObjectBytes: "1073741824",
    maxEntrypointBytes: "1073741824",
    maxManifestBytes: "1048576",
    maxManifestFiles: 10_000,
    maxPathBytes: 1024,
  },
  conformance: [],
}

export const MARKDOWN_DRIVER: MarkdownDriverDescriptor = {
  id: "org.eidos.driver.markdown",
  version: "1.0",
  acceptedMediaTypes: ["text/markdown"],
  targetKinds: ["static"],
  limits: {
    maxObjectBytes: "1073741824",
    maxEntrypointBytes: "16777216",
    maxManifestBytes: "1048576",
    maxManifestFiles: 10_000,
    maxPathBytes: 1024,
  },
  conformance: ["EP-Markdown-1.0", "EP-Static-1.0"],
}

export const FORM_DRIVER: FormDriverDescriptor = {
  id: "org.eidos.driver.form",
  version: "1.0",
  acceptedMediaTypes: ["application/vnd.eidos.form+json"],
  targetKinds: ["static"],
  limits: {
    maxObjectBytes: "262144",
    maxEntrypointBytes: "262144",
    maxManifestBytes: "1048576",
    maxManifestFiles: 1,
    maxPathBytes: 1024,
  },
  conformance: ["EP-Core-1.0", "EP-Static-1.0", "EP-Collect-1.0"],
}

export class SourceBundleError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "SourceBundleError"
    this.code = code
  }
}

export async function validateSourceBundle(
  value: unknown,
  limits: { maxObjectBytes: string }
): Promise<ValidatedSourceBundle> {
  const manifest = parseManifest(value)
  const driver = driverForMediaType(manifest.mediaType)
  const canonical = canonicalJson(manifest)
  if (
    encoder.encode(canonical).byteLength >
    Number(driver.limits.maxManifestBytes)
  ) {
    throw invalid(
      "source_manifest_too_large",
      "Source manifest exceeds the hosted limit"
    )
  }
  const maxObjectBytes = minBigInt(
    BigInt(limits.maxObjectBytes),
    BigInt(driver.limits.maxObjectBytes)
  )
  for (const file of manifest.files) {
    if (BigInt(file.bytes) > maxObjectBytes) {
      throw invalid(
        "source_object_too_large",
        "A Source Bundle object exceeds the 1 GiB limit"
      )
    }
  }
  const entrypoint = manifest.files.find(
    (file) => file.path === manifest.entrypoint
  )!
  if (BigInt(entrypoint.bytes) > BigInt(driver.limits.maxEntrypointBytes)) {
    throw invalid(
      "source_entrypoint_too_large",
      driver.id === MARKDOWN_DRIVER.id
        ? "Markdown documents cannot exceed 16 MiB"
        : driver.id === FORM_DRIVER.id
          ? "Form definitions cannot exceed 256 KiB"
          : "Source entrypoint exceeds the Driver limit"
    )
  }
  return {
    manifest,
    canonicalJson: canonical,
    manifestSha256: await canonicalSha256(manifest),
    sourceBytes: manifest.files
      .reduce((total, file) => total + BigInt(file.bytes), 0n)
      .toString(),
    driver,
    entrypoint,
  }
}

export function driverForMediaType(mediaType: string): PublishDriverDescriptor {
  if (mediaType === EIDOS_DRIVER.acceptedMediaTypes[0]) return EIDOS_DRIVER
  if (mediaType === MARKDOWN_DRIVER.acceptedMediaTypes[0])
    return MARKDOWN_DRIVER
  if (mediaType === FORM_DRIVER.acceptedMediaTypes[0]) return FORM_DRIVER
  throw invalid(
    "unsupported_media_type",
    "No installed Driver accepts this media type"
  )
}

export function contentObjectKey(tenantId: string, sha256: string): string {
  return [
    "tenants",
    tenantId,
    "objects",
    "sha256",
    sha256.slice(0, 2),
    sha256,
  ].join("/")
}

export function sourceManifestObjectKey(
  tenantId: string,
  publicationId: string,
  versionId: string
): string {
  return ["sources", tenantId, publicationId, versionId, "manifest.json"].join(
    "/"
  )
}

export function manifestBytes(manifest: SourceBundleManifest): Uint8Array {
  return canonicalJsonBytes(manifest)
}

function parseManifest(value: unknown): SourceBundleManifest {
  if (
    !isExactRecord(value, [
      "spec",
      "mediaType",
      "entrypoint",
      "files",
      "assetReferences",
    ])
  ) {
    throw invalid(
      "invalid_source_manifest",
      "Source manifest has an invalid shape"
    )
  }
  if (value.spec !== "eidos.publish/source-bundle@1") {
    throw invalid(
      "unsupported_source_bundle",
      "Unsupported Source Bundle specification"
    )
  }
  if (typeof value.mediaType !== "string") {
    throw invalid("unsupported_media_type", "Source media type is invalid")
  }
  const driver = driverForMediaType(value.mediaType)
  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw invalid("invalid_source_manifest", "Source Bundle must contain files")
  }
  if (value.files.length > driver.limits.maxManifestFiles) {
    throw invalid(
      "source_file_limit_reached",
      "Source Bundle has too many files"
    )
  }
  const files = value.files.map(parseFile)
  requireSortedUnique(files, (file) => file.path, "invalid_source_order")
  const bytesByDigest = new Map<string, string>()
  for (const file of files) {
    const prior = bytesByDigest.get(file.sha256)
    if (prior !== undefined && prior !== file.bytes) {
      throw invalid(
        "source_digest_conflict",
        "One source digest declares different byte counts"
      )
    }
    bytesByDigest.set(file.sha256, file.bytes)
  }
  if (typeof value.entrypoint !== "string") {
    throw invalid("invalid_source_entrypoint", "Source entrypoint is invalid")
  }
  validatePath(value.entrypoint)
  const entrypoints = files.filter((file) => file.role === "entrypoint")
  const entrypoint = entrypoints[0]
  if (entrypoints.length !== 1 || entrypoint?.path !== value.entrypoint) {
    throw invalid(
      "invalid_source_entrypoint",
      "Source Bundle must contain one entrypoint"
    )
  }
  if (
    driver.id === EIDOS_DRIVER.id &&
    (entrypoint.mediaType !== EIDOS_DRIVER.acceptedMediaTypes[0] ||
      !value.entrypoint.toLowerCase().endsWith(".eidos"))
  ) {
    throw invalid(
      "invalid_eidos_entrypoint",
      "Source Bundle must contain one Eidos entrypoint"
    )
  }
  if (
    driver.id === MARKDOWN_DRIVER.id &&
    (entrypoint.mediaType !== MARKDOWN_DRIVER.acceptedMediaTypes[0] ||
      !/\.(?:md|markdown)$/i.test(value.entrypoint))
  ) {
    throw invalid(
      "invalid_markdown_entrypoint",
      "Source Bundle must contain one Markdown entrypoint"
    )
  }
  if (
    driver.id === FORM_DRIVER.id &&
    (entrypoint.mediaType !== FORM_DRIVER.acceptedMediaTypes[0] ||
      value.entrypoint !== "form.json")
  ) {
    throw invalid(
      "invalid_form_entrypoint",
      "Source Bundle must contain one canonical Form definition"
    )
  }
  if (!Array.isArray(value.assetReferences)) {
    throw invalid(
      "invalid_asset_references",
      "Asset references must be an array"
    )
  }
  if (driver.id === FORM_DRIVER.id && value.assetReferences.length !== 0) {
    throw invalid(
      "invalid_asset_references",
      "Form definition bundles cannot contain source attachments"
    )
  }
  if (value.assetReferences.length > MAX_ASSET_REFERENCES) {
    throw invalid(
      "asset_reference_limit_reached",
      "Source Bundle has too many asset references"
    )
  }
  const assetReferences = value.assetReferences.map((reference) =>
    parseAssetReference(reference, driver)
  )
  requireSortedUnique(
    assetReferences,
    assetReferenceKey,
    "invalid_asset_reference_order"
  )
  const attachmentFiles = files.filter((file) => file.role === "attachment")
  const attachmentsByPath = new Map(
    attachmentFiles.map((file) => [file.path, file] as const)
  )
  const referencedPaths = new Set<string>()
  for (const reference of assetReferences) {
    const path = decodeURIComponent(reference.uri)
    const file = attachmentsByPath.get(path)
    if (file === undefined || file.sha256 !== reference.fileSha256) {
      throw invalid(
        "missing_asset_object",
        "Asset reference does not identify an attachment object"
      )
    }
    referencedPaths.add(path)
  }
  if (attachmentFiles.some((file) => !referencedPaths.has(file.path))) {
    throw invalid(
      "unreferenced_asset_object",
      "Source Bundle contains an unreferenced attachment"
    )
  }
  return {
    spec: "eidos.publish/source-bundle@1",
    mediaType: value.mediaType,
    entrypoint: value.entrypoint,
    files,
    assetReferences,
  }
}

function parseFile(value: unknown): SourceBundleFile {
  if (!isExactRecord(value, ["path", "role", "mediaType", "bytes", "sha256"])) {
    throw invalid(
      "invalid_source_manifest",
      "Source file descriptor has an invalid shape"
    )
  }
  if (typeof value.path !== "string") {
    throw invalid("invalid_source_path", "Source path is invalid")
  }
  validatePath(value.path)
  if (value.role !== "entrypoint" && value.role !== "attachment") {
    throw invalid("invalid_source_role", "Source file role is invalid")
  }
  if (
    typeof value.mediaType !== "string" ||
    !MEDIA_TYPE.test(value.mediaType)
  ) {
    throw invalid(
      "invalid_source_media_type",
      "Source file media type is invalid"
    )
  }
  if (typeof value.bytes !== "string" || !DECIMAL.test(value.bytes)) {
    throw invalid(
      "invalid_source_bytes",
      "Source byte count is not canonical decimal"
    )
  }
  if (typeof value.sha256 !== "string" || !SHA256.test(value.sha256)) {
    throw invalid(
      "invalid_source_digest",
      "Source digest must be lowercase SHA-256"
    )
  }
  return {
    path: value.path,
    role: value.role,
    mediaType: value.mediaType.toLowerCase(),
    bytes: value.bytes,
    sha256: value.sha256,
  }
}

function parseAssetReference(
  value: unknown,
  driver: PublishDriverDescriptor
): SourceBundleAssetReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(
      "invalid_asset_reference",
      "Asset reference has an invalid shape"
    )
  }
  const record = value as Record<string, unknown>
  if (typeof record.uri !== "string") {
    throw invalid("invalid_asset_uri", "Asset URI is invalid")
  }
  validateRelativeUri(record.uri)
  if (
    typeof record.fileSha256 !== "string" ||
    !SHA256.test(record.fileSha256)
  ) {
    throw invalid("invalid_asset_digest", "Asset reference digest is invalid")
  }
  if (driver.id === EIDOS_DRIVER.id) {
    if (
      !isExactRecord(record, ["kind", "entryId", "uri", "fileSha256"]) ||
      record.kind !== "eidos-file-entry" ||
      typeof record.entryId !== "string" ||
      !UUID_V7.test(record.entryId)
    ) {
      throw invalid(
        "invalid_asset_entry_id",
        "Eidos asset entry ID must be UUIDv7"
      )
    }
    return {
      kind: "eidos-file-entry",
      entryId: record.entryId,
      uri: record.uri,
      fileSha256: record.fileSha256,
    }
  }
  if (
    !isExactRecord(record, ["kind", "uri", "fileSha256"]) ||
    record.kind !== "markdown-link"
  ) {
    throw invalid(
      "invalid_asset_reference",
      "Markdown asset references must use markdown-link"
    )
  }
  return {
    kind: "markdown-link",
    uri: record.uri,
    fileSha256: record.fileSha256,
  }
}

export function assetReferenceKey(
  reference: SourceBundleAssetReference
): string {
  return reference.kind === "eidos-file-entry"
    ? reference.entryId
    : reference.uri
}

function validatePath(path: string): void {
  if (
    path.length === 0 ||
    path !== path.normalize("NFC") ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#") ||
    CONTROL.test(path) ||
    path
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") ||
    encoder.encode(path).byteLength > EIDOS_DRIVER.limits.maxPathBytes
  ) {
    throw invalid(
      "invalid_source_path",
      "Source path is not a normalized safe relative path"
    )
  }
}

export function validateRelativeUri(uri: string): void {
  if (/%2f|%5c/i.test(uri)) {
    throw invalid(
      "invalid_asset_uri",
      "Asset URI contains an encoded separator"
    )
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(uri)
  } catch {
    throw invalid("invalid_asset_uri", "Asset URI is not canonical UTF-8")
  }
  validatePath(decoded)
  if (decoded.split("/").map(encodeURIComponent).join("/") !== uri) {
    throw invalid("invalid_asset_uri", "Asset URI is not canonical")
  }
}

function requireSortedUnique<T>(
  values: T[],
  select: (value: T) => string,
  code: string
): void {
  for (let index = 1; index < values.length; index += 1) {
    if (compareUtf8(select(values[index - 1]!), select(values[index]!)) >= 0) {
      throw invalid(
        code,
        "Manifest entries must be unique and sorted by UTF-8 bytes"
      )
    }
  }
}

function compareUtf8(left: string, right: string): number {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!
  }
  return a.length - b.length
}

function isExactRecord(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  )
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right
}

function invalid(code: string, message: string): SourceBundleError {
  return new SourceBundleError(code, message)
}
