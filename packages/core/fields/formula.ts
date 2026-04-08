import type {
  CustomCell,
  NumberCell,
  TextCell,
} from "@glideapps/glide-data-grid"

import { getFieldInstance } from "."
import { BaseField } from "./base"
import { FieldType, GridCellKind } from "./const"
import type { FormulaMultiSelectCell, FormulaOptionCell } from "./interface"
import type { NumberProperty, RangeCell } from "./number"
import { SelectField } from "./select"

export type OptionColorConfig = {
  value: string
  color: string
}

export type FormulaProperty = {
  formula: string
  displayType?: FieldType
  // Number display configuration when displayType is FieldType.Number
  numberConfig?: Omit<NumberProperty, "format">
  // Option display configuration when displayType is FieldType.Select
  // colorMap is used to override auto hash colors
  optionConfig?: {
    colorMap: OptionColorConfig[]
  }
}

export class FormulaField extends BaseField<
  | TextCell
  | NumberCell
  | RangeCell
  | FormulaOptionCell
  | FormulaMultiSelectCell,
  FormulaProperty
> {
  static type = FieldType.Formula

  get compareOperators() {
    return []
  }

  get displayType() {
    return this.column.property.displayType ?? FieldType.Text
  }

  rawData2JSON(rawData: string) {
    return rawData
  }

  // Get color for option display
  // Priority: manual colorMap > auto hash color
  private getOptionColor(value: string): string {
    const optionConfig = this.column.property.optionConfig

    // Check manual color map first
    if (optionConfig?.colorMap) {
      const mapped = optionConfig.colorMap.find((c) => c.value === value)
      if (mapped) return mapped.color
    }

    // Auto hash color based on value
    const colors = SelectField.colors.light.map((c) => c.name)
    // Simple hash function
    let hash = 0
    for (let i = 0; i < value.length; i++) {
      hash = value.charCodeAt(i) + ((hash << 5) - hash)
    }
    const index = Math.abs(hash) % colors.length
    return colors[index]
  }

  getCellContent(
    rawData: string | number
  ):
    | TextCell
    | NumberCell
    | RangeCell
    | FormulaOptionCell
    | FormulaMultiSelectCell {
    const displayType = this.column.property.displayType ?? FieldType.Text
    const fieldConfig: any = {
      ...this.column,
      type: displayType,
    }

    // If display type is Number, pass the numberConfig as property
    if (displayType === FieldType.Number && this.column.property.numberConfig) {
      fieldConfig.property = this.column.property.numberConfig
    }

    const fieldInstance = getFieldInstance(fieldConfig)

    // Type conversion based on target displayType
    if (displayType === FieldType.Number) {
      // For Number display type, ensure rawData is a number
      const numValue =
        typeof rawData === "string" ? Number.parseFloat(rawData) : rawData
      // If conversion results in NaN, render as empty number cell
      if (Number.isNaN(numValue)) {
        return {
          kind: GridCellKind.Number,
          data: undefined,
          displayData: "",
          allowOverlay: true,
          readonly: true,
        }
      }
      const content = fieldInstance.getCellContent(numValue)
      return {
        ...content,
        allowOverlay: true,
        readonly: true,
      }
    } else if (
      displayType === FieldType.URL ||
      displayType === FieldType.File ||
      displayType === FieldType.Text
    ) {
      // For string-based display types, ensure rawData is a string
      const strValue =
        typeof rawData === "number" ? String(rawData) : (rawData ?? "")
      const content = fieldInstance.getCellContent(strValue)
      return {
        ...content,
        allowOverlay: true,
        readonly: true,
      }
    } else if (displayType === FieldType.Select) {
      // For Select display type, render as a single tag
      const strValue =
        typeof rawData === "number" ? String(rawData) : (rawData ?? "")
      const color = this.getOptionColor(strValue)
      return {
        kind: GridCellKind.Custom,
        data: {
          kind: "formula-option-cell",
          value: strValue,
          color: color,
        },
        copyData: strValue,
        allowOverlay: true,
        readonly: true,
      }
    } else if (displayType === FieldType.MultiSelect) {
      // For MultiSelect display type, split by comma and render as multiple tags
      const strValue =
        typeof rawData === "number" ? String(rawData) : (rawData ?? "")
      const values = strValue
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
      const options = values.map((v) => ({
        value: v,
        color: this.getOptionColor(v),
      }))
      return {
        kind: GridCellKind.Custom,
        data: {
          kind: "formula-multi-select-cell",
          values: options,
        },
        copyData: strValue,
        allowOverlay: true,
        readonly: true,
      }
    }

    const content = fieldInstance.getCellContent(rawData)
    return {
      ...content,
      allowOverlay: true,
      readonly: true,
    }
  }

  cellData2RawData(
    cell:
      | TextCell
      | NumberCell
      | RangeCell
      | FormulaOptionCell
      | FormulaMultiSelectCell
  ) {
    // For RangeCell (bar display), data is an object with value property
    if (cell.kind === GridCellKind.Custom) {
      const customCell = cell.data as any
      if (customCell.kind === "range-cell") {
        return {
          rawData: customCell.value ?? null,
        }
      } else if (customCell.kind === "formula-option-cell") {
        return {
          rawData: customCell.value ?? null,
        }
      } else if (customCell.kind === "formula-multi-select-cell") {
        // Join values back with comma
        const values = customCell.values
          ?.map((v: { value: string }) => v.value)
          .join(",")
        return {
          rawData: values || null,
        }
      }
    }
    return {
      rawData: cell.data ?? null,
    }
  }
}
