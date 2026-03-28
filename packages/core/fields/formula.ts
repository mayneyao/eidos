import type { TextCell } from "@glideapps/glide-data-grid"

import { getFieldInstance } from "."
import { BaseField } from "./base"
import { FieldType } from "./const"

export type FormulaProperty = {
  formula: string
  displayType?: FieldType
}

export class FormulaField extends BaseField<TextCell, FormulaProperty> {
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

  getCellContent(rawData: string): TextCell {
    const fieldInstance = getFieldInstance({
      ...this.column,
      type: this.column.property.displayType ?? FieldType.Text,
    })
    // Ensure rawData is converted to string for display types that expect string input
    const stringRawData = rawData != null ? String(rawData) : ""
    const content = fieldInstance.getCellContent(stringRawData)
    return {
      ...content,
      allowOverlay: true,
      readonly: true,
    }
  }

  cellData2RawData(cell: TextCell) {
    return {
      rawData: cell.data || null,
    }
  }
}
