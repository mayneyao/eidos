import { EidosFileError } from "./errors"
import type { EidosFileSelectOption } from "./types"

export function parseEidosFileSelectOptions(
  property: Record<string, unknown> | null | undefined
): EidosFileSelectOption[] {
  const options = property?.options
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    if (
      typeof option !== "object" ||
      option === null ||
      !("value" in option) ||
      typeof option.value !== "string"
    ) {
      return []
    }
    return [
      {
        value: option.value,
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
  if (!Array.isArray(rawOptions)) {
    throw new EidosFileError(
      "invalid-schema",
      "Select fields require an options array"
    )
  }
  const options = parseEidosFileSelectOptions(property)
  if (options.length !== rawOptions.length) {
    throw new EidosFileError(
      "invalid-schema",
      "Every select option requires a string value"
    )
  }
  const values = new Set<string>()
  for (const option of options) {
    if (!option.value.trim()) {
      throw new EidosFileError(
        "invalid-schema",
        "Select option values cannot be empty"
      )
    }
    if (values.has(option.value)) {
      throw new EidosFileError(
        "invalid-schema",
        `Duplicate select option value: ${option.value}`
      )
    }
    values.add(option.value)
  }
  return options
}
