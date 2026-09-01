import { EidosFileError } from "./errors"
import type {
  EidosFileFieldInfo,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "./types"

export const EIDOS_FILE_FORM_VIEW_TYPE = "form"

export const EIDOS_FILE_FORM_INPUT_FIELD_TYPES = [
  "text",
  "number",
  "integer",
  "checkbox",
  "select",
  "multi-select",
  "rating",
  "date",
  "datetime",
  "url",
  "file",
] as const

export type EidosFileFormInputFieldType =
  (typeof EIDOS_FILE_FORM_INPUT_FIELD_TYPES)[number]

export interface EidosFileFormViewFieldProperties {
  fieldId: string
  label?: string
  description?: string
  placeholder?: string
  multiline?: boolean
  required: boolean
}

export interface EidosFileFormViewProperties {
  title: string
  description: string | null
  submitLabel: string
  successMessage: string
  fields: EidosFileFormViewFieldProperties[]
}

const INPUT_TYPES = new Set<string>(EIDOS_FILE_FORM_INPUT_FIELD_TYPES)

function optionalString(value: unknown, maxBytes: number): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  if (
    !normalized ||
    new TextEncoder().encode(normalized).byteLength > maxBytes
  ) {
    return undefined
  }
  return normalized
}

export function isEidosFileFormInputField(
  field: EidosFileFieldInfo
): field is EidosFileFieldInfo & { type: EidosFileFormInputFieldType } {
  return (
    INPUT_TYPES.has(field.type) &&
    field.valueKind === "source" &&
    !field.isHidden
  )
}

function isEidosFileFormFieldRequiredBySchema(
  field: Pick<EidosFileFieldInfo, "type" | "nullable">
): boolean {
  return (
    field.nullable === false &&
    field.type !== "file" &&
    field.type !== "multi-select"
  )
}

export function eidosFileFormViewFields(
  table: EidosFileTableSnapshot,
  view: EidosFileViewInfo
): Array<EidosFileFieldInfo & { type: EidosFileFormInputFieldType }> {
  if (view.tableId !== table.table.id) {
    throw new EidosFileError(
      "invalid-value",
      `Form View ${view.id} does not belong to Table ${table.table.id}`
    )
  }
  const hidden = new Set(view.hiddenFields)
  return table.fields
    .filter(
      (
        field
      ): field is EidosFileFieldInfo & {
        type: EidosFileFormInputFieldType
      } => isEidosFileFormInputField(field) && !hidden.has(field.id)
    )
    .sort((left, right) => {
      const leftOrder = view.orderMap?.[left.id]
      const rightOrder = view.orderMap?.[right.id]
      return (
        (leftOrder ?? Number.MAX_SAFE_INTEGER) -
          (rightOrder ?? Number.MAX_SAFE_INTEGER) ||
        (left.position ?? Number.MAX_SAFE_INTEGER) -
          (right.position ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id)
      )
    })
}

export function eidosFileFormViewProperties(
  view: EidosFileViewInfo,
  fields: readonly EidosFileFieldInfo[]
): EidosFileFormViewProperties {
  const raw = view.properties ?? {}
  const configured = Array.isArray(raw.fields) ? raw.fields : []
  const configuredById = new Map<string, Record<string, unknown>>()
  for (const value of configured) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const item = value as Record<string, unknown>
    if (typeof item.fieldId === "string" && !configuredById.has(item.fieldId)) {
      configuredById.set(item.fieldId, item)
    }
  }
  return {
    title: optionalString(raw.title, 512) ?? view.name,
    description:
      raw.description === null
        ? null
        : (optionalString(raw.description, 4_096) ?? null),
    submitLabel: optionalString(raw.submitLabel, 128) ?? "Submit",
    successMessage:
      optionalString(raw.successMessage, 1_024) ?? "Response recorded.",
    fields: fields.map((field) => {
      const item = configuredById.get(field.id)
      const label = optionalString(item?.label, 512)
      const description = optionalString(item?.description, 2_048)
      const placeholder = optionalString(item?.placeholder, 512)
      return {
        fieldId: field.id,
        ...(label ? { label } : {}),
        ...(description ? { description } : {}),
        ...(placeholder ? { placeholder } : {}),
        ...(field.type === "text" && item?.multiline === true
          ? { multiline: true }
          : {}),
        required:
          item?.required === true ||
          isEidosFileFormFieldRequiredBySchema(field),
      }
    }),
  }
}
