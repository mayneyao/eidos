import type { PropertyType } from "./types"

/**
 * Infers the property type based on the value and key
 * If key is a system field, defaults to text type
 */
export const inferType = (value: any, key?: string): PropertyType => {
  // If key is provided and it's a system property, default to text
  if (key && isSystemProperty(key)) {
    switch (key) {
      case "is_day_page":
        return "boolean"
      case "created_at":
        return "date"
      case "updated_at":
        return "date"
      default:
        return "text"
    }
  }

  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number") return "number"
  if (
    Array.isArray(value) ||
    (typeof value === "string" && value.includes(","))
  )
    return "tags"
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value))
    return "date"
  return "text"
}

/**
 * Formats property value for display
 */
export const formatPropertyValue = (value: any, type: PropertyType): string => {
  if (value === undefined || value === null || value === "") {
    return ""
  }

  switch (type) {
    case "tags":
      return String(value)
        .split(",")
        .map((tag) => `#${tag.trim()}`)
        .join(" ")
    case "boolean":
      return value ? "true" : "false"
    default:
      return String(value)
  }
}

/**
 * Checks if a property value is empty
 */
export const isPropertyEmpty = (value: any): boolean => {
  return value === undefined || value === null || value === ""
}

/**
 * 系统属性名称列表
 * 这个列表应该与 packages/core/meta-table/doc.ts 中的 RESERVED_PROPERTIES 保持一致
 */
export const SYSTEM_PROPERTY_NAMES = [
  "id",
  "content",
  "markdown",
  "is_day_page",
  "created_at",
  "updated_at",
  "properties",
  "meta",
] as const

/**
 * 检查属性是否为系统属性
 */
export const isSystemProperty = (propertyName: string): boolean => {
  return SYSTEM_PROPERTY_NAMES.includes(propertyName as any)
}
