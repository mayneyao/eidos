import type { BaseFieldInfo } from "@eidos.space/base"

export interface BaseSelectOption {
  id: string
  name: string
  color: string
}

export interface BaseNumberProperty extends Record<string, unknown> {
  format: "number" | "percent" | "currency"
  showAs: "number" | "bar"
  color: string
  divideBy: number
  showNumber: boolean
}

export const DEFAULT_BASE_NUMBER_PROPERTY: BaseNumberProperty = {
  format: "number",
  showAs: "number",
  color: "purple",
  divideBy: 100,
  showNumber: true,
}

export const BASE_OPTION_COLORS = [
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

export function baseSelectOptions(field: BaseFieldInfo): BaseSelectOption[] {
  const options = field.property?.options
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    if (
      typeof option !== "object" ||
      option === null ||
      !("id" in option) ||
      !("name" in option) ||
      typeof option.id !== "string" ||
      typeof option.name !== "string"
    ) {
      return []
    }
    return [
      {
        id: option.id,
        name: option.name,
        color:
          "color" in option && typeof option.color === "string"
            ? option.color
            : "default",
      },
    ]
  })
}

export function baseNumberProperty(field: BaseFieldInfo): BaseNumberProperty {
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

export function baseOptionColor(name: string, theme: "light" | "dark"): string {
  const color =
    BASE_OPTION_COLORS.find((candidate) => candidate.name === name) ??
    BASE_OPTION_COLORS[0]
  return color[theme]
}
