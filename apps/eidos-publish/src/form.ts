import { sha256 } from "@noble/hashes/sha2.js"

import { FORM_DRIVER, validateSourceBundle } from "./bundle"
import { canonicalJson } from "./canonical"
import type {
  PublicationVersionRecord,
  PublicFormDocumentDefinition,
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

export const FORM_CLIENT_SCRIPT_PATH = "/_eidos/forms/client.v3.js"

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
  const stored = await env.FORM_INBOXES.getByName(tenantId).storeRevision({
    publicationId: version.publicationId,
    versionId: version.versionId,
    schemaFingerprint: definition.source.schemaFingerprint,
    definitionSha256: version.entrypoint.sha256,
    definitionJson: canonicalJson(definition),
  })
  if (!stored.ok) {
    throw new FormPreparationError(stored.error.code, stored.error.message)
  }
  const document = formDocument(
    slug,
    publicFormDocumentDefinition(version.versionId, definition)
  )
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

export async function activateFormRevision(
  env: Env,
  tenantId: string,
  tenant: DurableObjectStub<PublishTenant>,
  publicationId: string
): Promise<void> {
  const resolved = await tenant.resolvePublicationById(publicationId)
  if (!resolved.ok) {
    throw new FormPreparationError(resolved.error.code, resolved.error.message)
  }
  const activated = await env.FORM_INBOXES.getByName(tenantId).activateRevision(
    publicationId,
    resolved.value.version.versionId,
    resolved.value.formPolicy
  )
  if (!activated.ok) {
    throw new FormPreparationError(
      activated.error.code,
      activated.error.message
    )
  }
}

export function publicFormDocumentDefinition(
  publicationVersionId: string,
  definition: PublishedFormDefinition
): PublicFormDocumentDefinition {
  return {
    spec: "eidos.publish/public-form@1",
    publicationVersionId,
    presentation: definition.presentation,
    fields: definition.fields.map(
      ({ fieldId: _fieldId, nullable: _nullable, ...field }) => field
    ),
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
    maxEidosFileBytes: "1073741824",
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
    const normalizedConstraints =
      field.type === "select" || field.type === "multi-select"
        ? {
            ...constraints,
            options: publishedFormOptions(constraints.options),
          }
        : constraints
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
      constraints: normalizedConstraints,
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

function publishedFormOptions(
  value: unknown
): Array<{ name: string; color: string }> {
  if (!Array.isArray(value)) {
    throw invalid("form_definition_invalid", "Select field options are invalid")
  }
  const names = new Set<string>()
  return value.map((candidate) => {
    const option = exactRecord(candidate, ["name", "color"])
    if (
      typeof option.name !== "string" ||
      option.name.length === 0 ||
      CONTROL.test(option.name) ||
      typeof option.color !== "string" ||
      option.color.length === 0 ||
      CONTROL.test(option.color) ||
      names.has(option.name)
    ) {
      throw invalid(
        "form_definition_invalid",
        "Select field options are invalid"
      )
    }
    names.add(option.name)
    return { name: option.name, color: option.color }
  })
}

function formDocument(
  slug: string,
  definition: PublicFormDocumentDefinition
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(definition.presentation.title)}</title>
  <style data-eidos-form-theme="v2">
    :root {
      color-scheme: light;
      font-family: "Aptos", "Segoe UI Variable", "Segoe UI", sans-serif;
      line-height: 1.5;
      --background: oklch(0.982 0.006 255);
      --foreground: oklch(0.25 0.018 255);
      --primary: oklch(0.43 0.09 255);
      --primary-foreground: oklch(0.985 0.005 255);
      --popover: oklch(0.995 0.003 255);
      --muted: oklch(0.95 0.009 255);
      --accent: oklch(0.92 0.022 255);
      --muted-foreground: oklch(0.52 0.02 255);
      --border: oklch(0.88 0.012 255);
      --ring: oklch(0.56 0.12 255);
      --destructive: oklch(0.56 0.19 27);
      --success: oklch(0.48 0.12 150);
      --floating-shadow: 0 0.125rem 0.375rem oklch(0.16 0.012 230 / 11%);
      --radius: 0.5rem;
    }
    * { box-sizing: border-box; }
    html { min-height: 100%; background: var(--background); }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--foreground);
      background: var(--background);
      font-size: 0.8125rem;
      font-synthesis: none;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }
    main {
      width: 100%;
      max-width: 48rem;
      margin: 0 auto;
      padding: 3rem 4rem 6rem;
    }
    .form-header {
      margin-bottom: 2rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
    }
    h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      line-height: 2rem;
      letter-spacing: -0.025em;
    }
    .form-description {
      max-width: 65ch;
      margin: 0.5rem 0 0;
      color: var(--muted-foreground);
      font-size: 0.875rem;
      line-height: 1.5rem;
      white-space: pre-wrap;
    }
    form { display: grid; gap: 1.5rem; }
    .field { display: grid; gap: 0.375rem; min-width: 0; }
    .field-label {
      width: fit-content;
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1.25rem;
    }
    .field-description {
      margin: 0;
      color: var(--muted-foreground);
      font-size: 0.6875rem;
      line-height: 1rem;
      white-space: pre-wrap;
    }
    .required { margin-left: 0.25rem; color: var(--destructive); }
    input, textarea, select, button { font: inherit; }
    .form-control {
      width: 100%;
      border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
      border-radius: calc(var(--radius) - 0.125rem);
      outline: none;
      color: var(--foreground);
      background: transparent;
      box-shadow: none;
      font-size: 0.75rem;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    input.form-control, select.form-control {
      height: 2.25rem;
      padding: 0 0.75rem;
    }
    textarea.form-control {
      min-height: 6rem;
      padding: 0.5rem 0.75rem;
      line-height: 1.25rem;
      resize: vertical;
    }
    .form-control::placeholder { color: var(--muted-foreground); }
    .form-control:focus-visible,
    .file-control:focus-within,
    .choice-trigger:focus-visible {
      border-color: var(--ring);
      box-shadow: 0 0 0 1px var(--ring);
    }
    .checkbox-control {
      width: 1rem;
      height: 1rem;
      margin: 0.25rem 0;
      accent-color: var(--primary);
    }
    .choice-control { position: relative; min-width: 0; }
    .choice-trigger {
      display: flex;
      width: 100%;
      min-height: 2rem;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.25rem 0.5rem;
      border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
      border-radius: calc(var(--radius) - 0.125rem);
      outline: none;
      color: var(--foreground);
      background: var(--background);
      font-size: 0.75rem;
      font-weight: 400;
      text-align: left;
      cursor: pointer;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .choice-control.is-invalid .choice-trigger {
      border-color: var(--destructive);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--destructive) 35%, transparent);
    }
    .choice-value {
      display: flex;
      min-width: 0;
      flex: 1;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
    }
    .choice-placeholder { color: var(--muted-foreground); }
    .choice-chevron {
      width: 0.45rem;
      height: 0.45rem;
      flex: 0 0 auto;
      margin: 0 0.25rem 0.2rem 0;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      opacity: 0.5;
      transform: rotate(45deg);
      transition: transform 120ms ease;
    }
    .choice-control.is-open .choice-chevron {
      margin-bottom: -0.2rem;
      transform: rotate(225deg);
    }
    .choice-menu {
      position: absolute;
      top: calc(100% + 0.25rem);
      left: 0;
      z-index: 50;
      width: min(16rem, 100%);
      max-height: 20rem;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 0.25rem;
      border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
      border-radius: calc(var(--radius) - 0.125rem);
      color: var(--foreground);
      background: var(--popover);
      box-shadow: var(--floating-shadow);
      scrollbar-color: var(--border) transparent;
      scrollbar-width: thin;
    }
    .choice-menu[hidden] { display: none; }
    .choice-menu-item {
      display: flex;
      width: 100%;
      height: 1.75rem;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.5rem;
      border: 0;
      border-radius: calc(var(--radius) - 0.25rem);
      color: inherit;
      background: transparent;
      font-size: 0.75rem;
      text-align: left;
      cursor: pointer;
    }
    .choice-menu-item:hover,
    .choice-menu-item:focus-visible { outline: none; background: var(--accent); }
    .choice-check {
      display: flex;
      width: 0.875rem;
      height: 0.875rem;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 0.2rem;
      font-size: 0.6875rem;
      line-height: 1;
    }
    .choice-menu-item[aria-selected="true"] .choice-check::after { content: "✓"; }
    .choice-empty-item .choice-check { border-color: transparent; }
    .option-tag {
      display: inline-flex;
      max-width: 11.875rem;
      align-items: center;
      overflow: hidden;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      background: #cccccc;
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .option-tag[data-option-color="gray"] { background: #eeeeee; }
    .option-tag[data-option-color="brown"] { background: #e6c9a8; }
    .option-tag[data-option-color="pink"] { background: #ffd3e6; }
    .option-tag[data-option-color="red"] { background: #ffadad; }
    .option-tag[data-option-color="orange"] { background: #ffd6a5; }
    .option-tag[data-option-color="yellow"] { background: #fdffb6; }
    .option-tag[data-option-color="green"] { background: #caffbf; }
    .option-tag[data-option-color="cyan"] { background: #9bf6ff; }
    .option-tag[data-option-color="blue"] { background: #a0c4ff; }
    .option-tag[data-option-color="purple"] { background: #bdb2ff; }
    .file-control {
      position: relative;
      display: flex;
      min-height: 2.5rem;
      align-items: center;
      gap: 0.75rem;
      overflow: hidden;
      padding: 0.25rem;
      border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
      border-radius: calc(var(--radius) - 0.125rem);
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .file-input {
      position: absolute;
      inset: 0;
      z-index: 1;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }
    .file-action {
      display: inline-flex;
      height: 1.875rem;
      flex: 0 0 auto;
      align-items: center;
      padding: 0 0.625rem;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 0.1875rem);
      background: var(--muted);
      font-size: 0.6875rem;
      font-weight: 500;
    }
    .file-summary {
      min-width: 0;
      overflow: hidden;
      color: var(--muted-foreground);
      font-size: 0.6875rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .form-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .submit-button {
      display: inline-flex;
      width: fit-content;
      min-width: 6rem;
      height: 2rem;
      align-items: center;
      justify-content: center;
      padding: 0 0.75rem;
      border: 0;
      border-radius: calc(var(--radius) - 0.125rem);
      color: var(--primary-foreground);
      background: var(--primary);
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: filter 120ms ease, opacity 120ms ease;
    }
    .submit-button:hover { filter: brightness(0.94); }
    .submit-button:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
    .submit-button:disabled { cursor: wait; opacity: 0.5; }
    .status {
      margin: 0;
      font-size: 0.75rem;
      line-height: 1.25rem;
    }
    .status:empty { display: none; }
    .status.is-pending { color: var(--muted-foreground); }
    .status.is-success { color: var(--success); }
    .status.is-error { color: var(--destructive); }
    .form-loading { margin: 0; color: var(--muted-foreground); font-size: 0.75rem; }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --background: oklch(0.21 0.014 255);
        --foreground: oklch(0.92 0.01 255);
        --primary: oklch(0.76 0.08 255);
        --primary-foreground: oklch(0.2 0.018 255);
        --popover: oklch(0.235 0.016 255);
        --muted: oklch(0.275 0.016 255);
        --accent: oklch(0.31 0.025 255);
        --muted-foreground: oklch(0.69 0.02 255);
        --border: oklch(0.34 0.017 255);
        --ring: oklch(0.69 0.1 255);
        --destructive: oklch(0.65 0.18 27);
        --success: oklch(0.72 0.11 150);
        --floating-shadow: 0 0.125rem 0.375rem oklch(0.04 0.01 230 / 38%);
      }
      .option-tag { background: #333333; }
      .option-tag[data-option-color="gray"] { background: #555555; }
      .option-tag[data-option-color="brown"] { background: #5b4d3d; }
      .option-tag[data-option-color="pink"] { background: #9a3f5e; }
      .option-tag[data-option-color="red"] { background: #a63232; }
      .option-tag[data-option-color="orange"] { background: #a65a20; }
      .option-tag[data-option-color="yellow"] { background: #6e6620; }
      .option-tag[data-option-color="green"] { background: #23563b; }
      .option-tag[data-option-color="cyan"] { background: #1c5858; }
      .option-tag[data-option-color="blue"] { background: #3168a8; }
      .option-tag[data-option-color="purple"] { background: #6e33b4; }
      .submit-button:hover { filter: brightness(1.08); }
    }
    @media (max-width: 40rem) {
      main { padding: 2rem 1.25rem 4rem; }
      .form-header { margin-bottom: 1.5rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .form-control, .file-control, .choice-trigger, .choice-chevron, .submit-button { transition: none; }
    }
  </style>
</head>
<body><main id="eidos-form-root" data-eidos-published-form data-slug="${escapeHtml(slug)}"><p class="form-loading">Loading form…</p></main><script id="eidos-form-definition" type="application/json">${embeddedJson(definition)}</script><script src="${FORM_CLIENT_SCRIPT_PATH}" defer></script></body>
</html>`
}

function embeddedJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
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
