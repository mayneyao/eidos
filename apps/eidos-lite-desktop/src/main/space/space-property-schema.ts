import type {
  CreateEidosFileFieldInput,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import {
  SPACE_PROPERTIES_NAMESPACE,
  type SpacePropertyDefinition,
  type SpacePropertySchema,
} from "../../shared/space-properties"

/** The root catalog owns field definitions; folder scope never changes its saved Views. */
export function spacePropertyTable(snapshot: EidosFileSnapshot) {
  const tables = snapshot.tables.filter(
    ({ table }) => table.settings?.vtabModule === "fs_meta"
  )
  const table = tables[0]
  const config = table?.table.settings?.vtabConfig as
    | Record<string, unknown>
    | undefined
  if (
    tables.length !== 1 ||
    !table ||
    config?.root !== "." ||
    config.namespace !== SPACE_PROPERTIES_NAMESPACE
  )
    throw new Error(
      "Space files.eidos must contain one file metadata table rooted at '.' with namespace space.eidos.meta."
    )
  return table
}

export function spacePropertySchema(
  snapshot: EidosFileSnapshot
): SpacePropertySchema {
  const fields: SpacePropertyDefinition[] = []
  for (const field of spacePropertyTable(snapshot).fields) {
    if (
      field.systemRole ||
      field.settings?.isSystem ||
      field.isDerived ||
      field.writable === false
    )
      continue
    const display = field.settings?.display as { kind?: string } | undefined
    const type =
      field.type === "multi-select"
        ? "tags"
        : field.type === "integer"
          ? field.settings?.control === "rating" || display?.kind === "rating"
            ? "rating"
            : "number"
          : field.type
    if (
      !["text", "number", "rating", "checkbox", "select", "tags"].includes(type)
    )
      continue
    const options = field.property?.options ?? field.settings?.options
    fields.push({
      field,
      key: String(
        field.settings?.vtabStorageKey ?? field.physicalName ?? field.name
      ),
      name: field.name,
      type: type as SpacePropertyDefinition["type"],
      ...(field.type === "integer" ? { integer: true } : {}),
      ...(Array.isArray(options)
        ? {
            options: options.flatMap((option: unknown) => {
              const name =
                typeof option === "string"
                  ? option
                  : (option as { name?: unknown } | null)?.name
              return typeof name === "string" ? [name] : []
            }),
          }
        : {}),
    })
  }
  return { version: 1, fields }
}

export function spacePropertyFieldInput(
  field: SpacePropertyDefinition
): CreateEidosFileFieldInput {
  return {
    name: field.key,
    type: field.type === "tags" ? "multi-select" : field.type,
    ...(["tags", "select"].includes(field.type)
      ? {
          property: {
            options: (field.options ?? []).map((name) => ({
              name,
              color: "gray",
            })),
          },
        }
      : {}),
  }
}
