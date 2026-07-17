import { BaseError } from "./errors"
import type { BaseSelectOption } from "./types"

export function parseBaseSelectOptions(
  property: Record<string, unknown> | null | undefined
): BaseSelectOption[] {
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

export function assertBaseSelectOptions(
  property: Record<string, unknown> | null | undefined
): BaseSelectOption[] {
  const rawOptions = property?.options
  if (!Array.isArray(rawOptions)) {
    throw new BaseError(
      "invalid-schema",
      "Select fields require an options array"
    )
  }
  const options = parseBaseSelectOptions(property)
  if (options.length !== rawOptions.length) {
    throw new BaseError(
      "invalid-schema",
      "Every select option requires a string value"
    )
  }
  const values = new Set<string>()
  for (const option of options) {
    if (!option.value.trim()) {
      throw new BaseError(
        "invalid-schema",
        "Select option values cannot be empty"
      )
    }
    if (values.has(option.value)) {
      throw new BaseError(
        "invalid-schema",
        `Duplicate select option value: ${option.value}`
      )
    }
    values.add(option.value)
  }
  return options
}
