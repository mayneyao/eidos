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

  rawData2JSON(rawData: string) {
    return rawData
  }

  getCellContent(rawData: string): TextCell {
    const fieldInstance = getFieldInstance({
      ...this.column,
      type: this.column.property.displayType ?? FieldType.Text,
    })
    const content = fieldInstance.getCellContent(rawData)
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
