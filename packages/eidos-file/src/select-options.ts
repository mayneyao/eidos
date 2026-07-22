import { EidosFileError } from "./errors"
import type { EidosFileSelectOption } from "./types"

export function parseEidosFileSelectOptions(
  property: Record<string, unknown> | null | undefined
): EidosFileSelectOption[] {
  const options = property?.options
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    if (typeof option !== "object" || option === null) return []
    const name =
      "name" in option && typeof option.name === "string" ? option.name : null
    if (name === null) return []
    return [
      {
        name,
        color:
          "color" in option && typeof option.color === "string"
            ? option.color
            : "default",
      },
    ]
  })
}

export function assertEidosFileSelectOptions(
  property: Record<string, unknown> | null | undefined
): EidosFileSelectOption[] {
  const rawOptions = property?.options
  if (rawOptions === undefined) return []
  if (!Array.isArray(rawOptions)) {
    throw new EidosFileError(
      "invalid-schema",
      "Select Field settings.options must be an array"
    )
  }
  const options = parseEidosFileSelectOptions(property)
  if (options.length !== rawOptions.length) {
    throw new EidosFileError(
      "invalid-schema",
      "Every Select option requires a string name"
    )
  }
  const names = new Set<string>()
  for (const option of options) {
    const name = option.name
    if (names.has(name)) {
      throw new EidosFileError(
        "constraint-conflict",
        `Duplicate Select option name: ${name}`
      )
    }
    names.add(name)
  }
  return options
}
