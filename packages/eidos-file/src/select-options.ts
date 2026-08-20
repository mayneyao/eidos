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

/** Returns the configured create-time default for a Select Field, if present. */
export function parseEidosFileSelectDefaultOption(
  property: Record<string, unknown> | null | undefined
): string | null {
  return typeof property?.defaultOption === "string"
    ? property.defaultOption
    : null
}

/**
 * Validates that a Select create-time default names an option in the same
 * catalog. An absent member means that newly created Rows receive no Select
 * default.
 */
export function assertEidosFileSelectDefaultOption(
  property: Record<string, unknown> | null | undefined
): string | null {
  const rawDefault = property?.defaultOption
  if (rawDefault === undefined) return null
  if (typeof rawDefault !== "string") {
    throw new EidosFileError(
      "invalid-schema",
      "Select Field settings.defaultOption must be a string"
    )
  }
  const options = assertEidosFileSelectOptions(property)
  if (!options.some((option) => option.name === rawDefault)) {
    throw new EidosFileError(
      "invalid-schema",
      "Select Field settings.defaultOption must name a configured option"
    )
  }
  return rawDefault
}

export function assertEidosFileMultiSelectHasNoDefaultOption(
  property: Record<string, unknown> | null | undefined
): void {
  if (property?.defaultOption !== undefined) {
    throw new EidosFileError(
      "invalid-schema",
      "Multi-select Field settings.defaultOption is not supported"
    )
  }
}
