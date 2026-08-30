import {
  parseEidosFileSelectDefaultOption,
  parseEidosFileSelectOptions,
  type EidosFileFieldInfo,
  type EidosFileSelectOption as EidosFileCanonicalSelectOption,
} from "@eidos.space/eidos-file"

export interface EidosFileSelectOption extends EidosFileCanonicalSelectOption {
  /** UI alias for the canonical option name/raw value. */
  value: string
}

export interface EidosFileNumberProperty extends Record<string, unknown> {
  format: "number" | "percent" | "currency"
  showAs: "number" | "bar"
  color: string
  divideBy: number
  showNumber: boolean
}

export function eidosFileFieldDisplaysUrl(field: EidosFileFieldInfo): boolean {
  return (
    field.storageCodec === "scalar" &&
    (field.type === "url" ||
      ((field.type === "formula" || field.type === "lookup") &&
        field.property?.displayType === "url"))
  )
}

export function eidosFileUrlDisplaysImage(field: EidosFileFieldInfo): boolean {
  const display = field.property?.display
  return (
    eidosFileFieldDisplaysUrl(field) &&
    typeof display === "object" &&
    display !== null &&
    !Array.isArray(display) &&
    (display as Record<string, unknown>).kind === "image"
  )
}

export const DEFAULT_BASE_NUMBER_PROPERTY: EidosFileNumberProperty = {
  format: "number",
  showAs: "number",
  color: "purple",
  divideBy: 100,
  showNumber: true,
}

export const EIDOS_FILE_OPTION_COLORS = [
  { name: "default", light: "#cccccc", dark: "#333333" },
  { name: "gray", light: "#eeeeee", dark: "#555555" },
  { name: "brown", light: "#e6c9a8", dark: "#5b4d3d" },
  { name: "pink", light: "#ffd3e6", dark: "#9a3f5e" },
  { name: "red", light: "#ffadad", dark: "#a63232" },
  { name: "orange", light: "#ffd6a5", dark: "#a65a20" },
  { name: "yellow", light: "#fdffb6", dark: "#6e6620" },
  { name: "green", light: "#caffbf", dark: "#23563b" },
  { name: "cyan", light: "#9bf6ff", dark: "#1c5858" },
  { name: "blue", light: "#a0c4ff", dark: "#3168a8" },
  { name: "purple", light: "#bdb2ff", dark: "#6e33b4" },
] as const

export function eidosFileSelectOptions(
  field: EidosFileFieldInfo
): EidosFileSelectOption[] {
  const canonical = parseEidosFileSelectOptions(field.property)
  const rawOptions = Array.isArray(field.property?.options)
    ? field.property.options
    : []
  const options =
    canonical.length > 0
      ? canonical.map((option, index) => ({
          ...(rawOptions[index] &&
          typeof rawOptions[index] === "object" &&
          !Array.isArray(rawOptions[index])
            ? (rawOptions[index] as Record<string, unknown>)
            : {}),
          ...option,
        }))
      : Array.isArray(field.property?.options)
        ? field.property.options.flatMap((option) => {
            if (
              !option ||
              Array.isArray(option) ||
              typeof option !== "object" ||
              typeof option.value !== "string" ||
              typeof option.color !== "string"
            ) {
              return []
            }
            return [{ name: option.value, color: option.color }]
          })
        : []
  return options.map((option) => ({
    ...option,
    value: option.name,
  }))
}

export function eidosFileSelectDefaultOption(
  field: EidosFileFieldInfo
): string | null {
  if (field.type !== "select") return null
  const value = parseEidosFileSelectDefaultOption(field.property)
  return value !== null &&
    eidosFileSelectOptions(field).some((option) => option.value === value)
    ? value
    : null
}

export function eidosFileNumberProperty(
  field: EidosFileFieldInfo
): EidosFileNumberProperty {
  const property = field.property
  const format = property?.format
  const showAs = property?.showAs
  return {
    format: format === "percent" || format === "currency" ? format : "number",
    showAs: showAs === "bar" ? "bar" : "number",
    color:
      typeof property?.color === "string"
        ? property.color
        : DEFAULT_BASE_NUMBER_PROPERTY.color,
    divideBy:
      typeof property?.divideBy === "number" && property.divideBy > 0
        ? property.divideBy
        : DEFAULT_BASE_NUMBER_PROPERTY.divideBy,
    showNumber: property?.showNumber !== false,
  }
}

export function eidosFileOptionColor(
  name: string,
  theme: "light" | "dark"
): string {
  const color =
    EIDOS_FILE_OPTION_COLORS.find((candidate) => candidate.name === name) ??
    EIDOS_FILE_OPTION_COLORS[0]
  return color[theme]
}

export function nextEidosFileOptionColor(
  options: readonly Pick<EidosFileSelectOption, "color">[]
): string {
  const used = new Set(options.map((option) => option.color))
  return (
    EIDOS_FILE_OPTION_COLORS.find(
      (color) => color.name !== "default" && !used.has(color.name)
    )?.name ??
    EIDOS_FILE_OPTION_COLORS[
      (options.length % Math.max(1, EIDOS_FILE_OPTION_COLORS.length - 1)) + 1
    ]?.name ??
    "default"
  )
}
