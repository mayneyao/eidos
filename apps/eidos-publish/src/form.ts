import { sha256 } from "@noble/hashes/sha2.js"

import { FORM_DRIVER, validateSourceBundle } from "./bundle"
import type {
  PublicationVersionRecord,
  PublishedFormDefinition,
  PublishedFormFieldType,
  ReadyReceipt,
  SourceBundleManifest,
  StaticArtifactRecord,
  StaticServingTarget,
  ValidationReceipt,
} from "./contracts"
import { prepareStaticTarget, probeStaticTarget } from "./static"
import type { PublishTenant } from "./tenant"

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[0-9a-f]{64}$/
const DECIMAL = /^(?:0|[1-9][0-9]*)$/
const INPUT_KEY = /^[A-Za-z0-9_-]{16,64}$/
const CONTROL = /[\u0000-\u001f\u007f]/
const FIELD_TYPES = new Set<PublishedFormFieldType>([
  "integer",
  "text",
  "number",
  "checkbox",
  "date",
  "datetime",
  "file",
  "multi-select",
  "rating",
  "select",
  "url",
])

export class FormPreparationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "FormPreparationError"
    this.code = code
  }
}

export async function validateFormVersion(
  env: Env,
  version: PublicationVersionRecord
): Promise<ValidationReceipt> {
  await loadFormDefinition(env, version)
  return {
    sourceManifestSha256: version.sourceManifestSha256,
    driverId: FORM_DRIVER.id,
    driverVersion: FORM_DRIVER.version,
    valid: true,
    diagnostics: [],
  }
}

export async function prepareFormVersion(
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  tenantId: string,
  slug: string,
  version: PublicationVersionRecord
): Promise<{
  target: StaticServingTarget
  targetSha256: string
  readyReceipt: ReadyReceipt
  artifact: StaticArtifactRecord
}> {
  const definition = await loadFormDefinition(env, version)
  const document = formDocument(slug, definition.presentation.title)
  const prepared = await prepareStaticTarget(
    env,
    tenant,
    tenantId,
    version,
    encoder.encode(document)
  )
  return {
    ...prepared,
    readyReceipt: {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: FORM_DRIVER.id,
      driverVersion: FORM_DRIVER.version,
      servingTargetSha256: prepared.targetSha256,
      readyAt: new Date().toISOString(),
      conformance: FORM_DRIVER.conformance,
    },
  }
}

export async function probeFormTarget(
  env: Env,
  target: StaticServingTarget,
  artifact: StaticArtifactRecord
): Promise<void> {
  try {
    await probeStaticTarget(env, target, artifact)
  } catch {
    throw new FormPreparationError(
      "static_target_unavailable",
      "Form static target did not pass its readiness probe"
    )
  }
}

export async function loadFormDefinition(
  env: Env,
  version: PublicationVersionRecord
): Promise<PublishedFormDefinition> {
  if (
    version.driverId !== FORM_DRIVER.id ||
    version.driverVersion !== FORM_DRIVER.version
  ) {
    throw invalid(
      "unsupported_driver",
      "Version is not bound to the Form Driver"
    )
  }
  const manifestObject = await env.PUBLISH_OBJECTS.get(
    version.sourceManifestKey
  )
  if (manifestObject === null || manifestObject.size > 1024 * 1024) {
    throw invalid(
      "source_manifest_unavailable",
      "Form Source Bundle manifest is unavailable"
    )
  }
  const manifest = await manifestObject.json<SourceBundleManifest>()
  const bundle = await validateSourceBundle(manifest, {
    maxObjectBytes: FORM_DRIVER.limits.maxObjectBytes,
  })
  if (
    bundle.manifestSha256 !== version.sourceManifestSha256 ||
    bundle.driver.id !== FORM_DRIVER.id ||
    bundle.entrypoint.sha256 !== version.entrypoint.sha256
  ) {
    throw invalid(
      "source_manifest_mismatch",
      "Form Source Bundle no longer matches the Version"
    )
  }
  const source = await env.PUBLISH_OBJECTS.get(version.entrypointObjectKey)
  if (
    source === null ||
    source.size > Number(FORM_DRIVER.limits.maxEntrypointBytes) ||
    source.size.toString() !== bundle.entrypoint.bytes ||
    source.customMetadata?.contentSha256 !== bundle.entrypoint.sha256
  ) {
    throw invalid(
      "form_definition_invalid",
      "Form definition is unavailable or exceeds 256 KiB"
    )
  }
  const bytes = new Uint8Array(await source.arrayBuffer())
  if (hex(sha256(bytes)) !== bundle.entrypoint.sha256) {
    throw invalid(
      "source_digest_mismatch",
      "Form definition digest does not match the manifest"
    )
  }
  let value: unknown
  try {
    value = JSON.parse(decoder.decode(bytes)) as unknown
  } catch {
    throw invalid(
      "form_definition_invalid",
      "Form definition must be UTF-8 JSON"
    )
  }
  return parsePublishedFormDefinition(value)
}

export function parsePublishedFormDefinition(
  value: unknown
): PublishedFormDefinition {
  const root = exactRecord(value, ["spec", "source", "presentation", "fields"])
  if (root.spec !== "eidos.publish/form-definition@1") {
    throw invalid("form_definition_invalid", "Unsupported Form definition")
  }
  const source = exactRecord(root.source, [
    "fileId",
    "tableId",
    "viewId",
    "schemaRevision",
    "schemaFingerprint",
  ])
  for (const key of ["fileId", "tableId", "viewId"] as const) {
    if (typeof source[key] !== "string" || !UUID_V7.test(source[key])) {
      throw invalid("form_definition_invalid", `Invalid Form source ${key}`)
    }
  }
  if (
    typeof source.schemaRevision !== "string" ||
    !DECIMAL.test(source.schemaRevision) ||
    typeof source.schemaFingerprint !== "string" ||
    !SHA256.test(source.schemaFingerprint)
  ) {
    throw invalid("form_definition_invalid", "Invalid Form schema evidence")
  }
  const presentation = exactRecord(root.presentation, [
    "title",
    "description",
    "submitLabel",
    "successMessage",
  ])
  const title = requiredText(presentation.title, 512, "title")
  const description = nullableText(
    presentation.description,
    4096,
    "description"
  )
  const submitLabel = requiredText(
    presentation.submitLabel,
    128,
    "submit label"
  )
  const successMessage = requiredText(
    presentation.successMessage,
    1024,
    "success message"
  )
  if (
    !Array.isArray(root.fields) ||
    root.fields.length === 0 ||
    root.fields.length > 100
  ) {
    throw invalid(
      "form_definition_invalid",
      "Form definition must contain 1 to 100 fields"
    )
  }
  const fieldIds = new Set<string>()
  const inputKeys = new Set<string>()
  const fields = root.fields.map((candidate) => {
    const field = exactRecord(candidate, [
      "fieldId",
      "inputKey",
      "type",
      "label",
      "description",
      "placeholder",
      "multiline",
      "required",
      "nullable",
      "constraints",
    ])
    if (
      typeof field.fieldId !== "string" ||
      !UUID_V7.test(field.fieldId) ||
      fieldIds.has(field.fieldId) ||
      typeof field.inputKey !== "string" ||
      !INPUT_KEY.test(field.inputKey) ||
      inputKeys.has(field.inputKey) ||
      typeof field.type !== "string" ||
      !FIELD_TYPES.has(field.type as PublishedFormFieldType) ||
      typeof field.multiline !== "boolean" ||
      (field.type !== "text" && field.multiline === true) ||
      typeof field.required !== "boolean" ||
      typeof field.nullable !== "boolean" ||
      (field.nullable === false &&
        field.type !== "file" &&
        field.type !== "multi-select" &&
        field.required !== true)
    ) {
      throw invalid("form_definition_invalid", "Form field identity is invalid")
    }
    fieldIds.add(field.fieldId)
    inputKeys.add(field.inputKey)
    const constraints = plainRecord(field.constraints)
    if (encoder.encode(JSON.stringify(constraints)).byteLength > 8192) {
      throw invalid(
        "form_definition_invalid",
        "Form field constraints are too large"
      )
    }
    return {
      fieldId: field.fieldId,
      inputKey: field.inputKey,
      type: field.type as PublishedFormFieldType,
      label: requiredText(field.label, 512, "field label"),
      description: nullableText(field.description, 2048, "field description"),
      placeholder: nullableText(field.placeholder, 512, "field placeholder"),
      multiline: field.multiline as boolean,
      required: field.required,
      nullable: field.nullable,
      constraints,
    }
  })
  return {
    spec: "eidos.publish/form-definition@1",
    source: {
      fileId: source.fileId as string,
      tableId: source.tableId as string,
      viewId: source.viewId as string,
      schemaRevision: source.schemaRevision as string,
      schemaFingerprint: source.schemaFingerprint as string,
    },
    presentation: { title, description, submitLabel, successMessage },
    fields,
  }
}

function formDocument(slug: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;--bg:#fff;--fg:#18181b;--muted:#71717a;--line:#e4e4e7;--soft:#f4f4f5;--accent:#0f766e;--danger:#b91c1c}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg)}main{width:min(100% - 32px,640px);margin:0 auto;padding:56px 0 96px}header{padding-bottom:24px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:1.75rem;line-height:1.2;letter-spacing:-.02em}header p{margin:10px 0 0;color:var(--muted)}form{display:grid;gap:22px;margin-top:28px}.field{display:grid;gap:7px}label{font-size:.875rem;font-weight:600}.hint{margin:0;color:var(--muted);font-size:.78rem}.required{color:var(--danger)}input,textarea,select,button{font:inherit}input,textarea,select{width:100%;border:1px solid var(--line);border-radius:7px;background:transparent;color:inherit;padding:9px 11px;outline:none}textarea{min-height:96px;resize:vertical}input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 18%,transparent)}button{width:max-content;min-width:110px;border:0;border-radius:7px;background:var(--accent);color:#fff;padding:9px 16px;font-weight:600;cursor:pointer}button:disabled{cursor:wait;opacity:.55}.status{font-size:.875rem}.error{color:var(--danger)}.files{font-size:.8rem;color:var(--muted)}
    @media(prefers-color-scheme:dark){:root{--bg:#111113;--fg:#f4f4f5;--muted:#a1a1aa;--line:#3f3f46;--soft:#27272a;--accent:#2dd4bf;--danger:#f87171}button{color:#052e2b}}
  </style>
</head>
<body><main id="eidos-form-root" data-slug="${escapeHtml(slug)}"><p>Loading form…</p></main><script src="/_eidos/forms/client.js" defer></script></body>
</html>`
}

function exactRecord(value: unknown, keys: string[]): Record<string, unknown> {
  const record = plainRecord(value)
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !keys.includes(key))
  ) {
    throw invalid("form_definition_invalid", "Form definition shape is invalid")
  }
  return record
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw invalid(
      "form_definition_invalid",
      "Form definition object is invalid"
    )
  }
  return value as Record<string, unknown>
}

function requiredText(value: unknown, maxBytes: number, name: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    CONTROL.test(value) ||
    encoder.encode(value).byteLength > maxBytes
  ) {
    throw invalid("form_definition_invalid", `Invalid Form ${name}`)
  }
  return value
}

function nullableText(
  value: unknown,
  maxBytes: number,
  name: string
): string | null {
  if (value === null) return null
  return requiredText(value, maxBytes, name)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function invalid(code: string, message: string): FormPreparationError {
  return new FormPreparationError(code, message)
}
