import type {
  FileMetaPatch,
  FileMetaValues,
  FileMetaValue,
} from "@eidos.space/plugin-sdk"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"

export const SPACE_PROPERTIES_NAMESPACE = "space.eidos.meta"
export const SPACE_PROPERTIES_FILE = "files.eidos"
export type SpacePropertyType =
  | "text"
  | "number"
  | "rating"
  | "checkbox"
  | "select"
  | "tags"
export interface SpacePropertyDefinition {
  key: string
  /** Runtime field descriptor, including configured option colors. */
  field?: EidosFileFieldInfo
  name?: string
  integer?: boolean
  type: SpacePropertyType
  options?: string[]
}

/** Adapt the built-in properties before the Space catalog has been created. */
export function spacePropertyEditorField(
  definition: SpacePropertyDefinition
): EidosFileFieldInfo {
  if (definition.field) return definition.field
  const type =
    definition.type === "tags"
      ? "multi-select"
      : definition.integer
        ? "integer"
        : definition.type
  return {
    id: definition.key,
    tableId: "space-properties",
    tableName: "files",
    tableColumnName: definition.key,
    name: definition.name ?? definition.key,
    type,
    nullable: true,
    writable: true,
    property: {
      options: (definition.options ?? []).map((name) => ({
        name,
        color: "gray",
      })),
    },
    storageCodec: type === "multi-select" ? "json_array" : "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}
export interface SpacePropertySchema {
  version: 1
  fields: SpacePropertyDefinition[]
}
export interface SpacePropertyEntry {
  path: string
  kind: "file" | "directory"
  values: FileMetaValues
}
export interface SpacePropertySelection {
  schema: SpacePropertySchema
  entries: SpacePropertyEntry[]
}
export interface SpacePropertyPatchResult {
  updated: string[]
  errors: { path: string; message: string }[]
}
export const DEFAULT_SPACE_PROPERTY_SCHEMA: SpacePropertySchema = {
  version: 1,
  fields: [
    { key: "tags", type: "tags" },
    { key: "rating", type: "rating" },
    { key: "status", type: "select", options: ["Todo", "In progress", "Done"] },
  ],
}

export function spacePropertyDefinition(
  value: unknown
): SpacePropertyDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid property definition")
  const field = value as Record<string, unknown>
  if (
    typeof field.key !== "string" ||
    !field.key.trim() ||
    new TextEncoder().encode(field.key).length > 1024 ||
    field.key.includes("\0") ||
    ["__proto__", "prototype", "constructor"].includes(field.key)
  )
    throw new Error("Invalid property name")
  if (
    !["text", "number", "rating", "checkbox", "select", "tags"].includes(
      String(field.type)
    )
  )
    throw new Error("Invalid property type")
  const options = field.options
  if (
    options !== undefined &&
    (!Array.isArray(options) ||
      options.length > 256 ||
      options.some(
        (item) => typeof item !== "string" || !item || item.length > 1024
      ) ||
      new Set(options).size !== options.length)
  )
    throw new Error("Invalid property options")
  return {
    key: field.key,
    type: field.type as SpacePropertyType,
    ...(options ? { options: options as string[] } : {}),
  }
}

export function assertSpacePropertyPatch(
  schema: SpacePropertySchema,
  patch: FileMetaPatch
): void {
  for (const [key, value] of Object.entries(patch.set ?? {})) {
    const field = schema.fields.find((candidate) => candidate.key === key)
    if (!field) throw new Error(`Unknown property: ${key}`)
    if (value === null) continue
    const valid =
      field.type === "text" || field.type === "select"
        ? typeof value === "string" &&
          (field.type !== "select" ||
            !field.options?.length ||
            field.options.includes(value))
        : field.type === "number"
          ? typeof value === "number" &&
            Number.isFinite(value) &&
            (!field.integer || Number.isInteger(value))
          : field.type === "rating"
            ? typeof value === "number" &&
              Number.isInteger(value) &&
              value >= 0 &&
              value <= 5
            : field.type === "checkbox"
              ? typeof value === "boolean"
              : Array.isArray(value) &&
                value.every((item) => typeof item === "string") &&
                (!field.options?.length ||
                  value.every((item) =>
                    field.options!.includes(String(item))
                  )) &&
                new Set(value).size === value.length
    if (!valid) throw new Error(`Invalid value for ${key}`)
  }
}

export function propertyValueText(value: FileMetaValue | undefined): string {
  if (value === undefined) return ""
  return typeof value === "string"
    ? value
    : Array.isArray(value) && value.every((item) => typeof item === "string")
      ? value.join(", ")
      : JSON.stringify(value)
}
