import { FieldType } from "@/packages/core/fields/const"
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
        return "datetime"
      case "updated_at":
        return "datetime"
      default:
        return "text"
    }
  }

  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number") return "number"
  // if (
  //   Array.isArray(value) ||
  //   (typeof value === "string" && value.includes(","))
  // )
  //   return "tags"
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    // Check if it's a datetime string (has time component)
    if (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ||
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ) {
      return "datetime"
    }
    return "date"
  }
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
      // Handle both boolean and numeric (0/1) representations
      return value === true || value === 1 ? "✓" : "✗"
    case "date":
      try {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString()
        }
      } catch {}
      return String(value)
    case "datetime":
      try {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toLocaleString()
        }
      } catch {}
      return String(value)
    default:
      return String(value)
  }
}

/**
 * Checks if a property value is empty
 */
export const isPropertyEmpty = (value: any): boolean => {
  // For boolean values (including 0/1 numeric representation), false/0 is not considered empty
  if (typeof value === "boolean" || value === 0 || value === 1) {
    return false
  }
  return value === undefined || value === null || value === ""
}

/**
 * System property name list
 * This list should be consistent with RESERVED_PROPERTIES in packages/core/meta-table/doc.ts
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
 * Check if property is a system property
 */
export const isSystemProperty = (propertyName: string): boolean => {
  return SYSTEM_PROPERTY_NAMES.includes(propertyName as any)
}

/**
 * Convert FieldType from database schema to PropertyType for display
 */
export const convertFieldTypeToPropertyType = (
  fieldType: FieldType
): string => {
  switch (fieldType) {
    case FieldType.Text:
    case FieldType.Title:
    case FieldType.URL:
    case FieldType.Formula:
      return "text"
    case FieldType.Number:
    case FieldType.Rating:
      return "number"
    case FieldType.Date:
      return "date"
    case FieldType.DateTime:
    case FieldType.CreatedTime:
    case FieldType.LastEditedTime:
      return "datetime"
    case FieldType.Checkbox:
      return "boolean"
    case FieldType.MultiSelect:
      return "tags"
    case FieldType.Select:
    case FieldType.File:
    case FieldType.Link:
    case FieldType.Lookup:
    case FieldType.CreatedBy:
    case FieldType.LastEditedBy:
    default:
      return "text"
  }
}
