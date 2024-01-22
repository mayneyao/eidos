import type { NumberCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import {
  CompareOperator,
  FieldType,
  GridCellKind,
  NUMBER_BASED_COMPARE_OPERATORS,
} from "./const"

type NumberProperty = {}

export class NumberField extends BaseField<NumberCell, NumberProperty, number> {
  static type = FieldType.Number

  get compareOperators() {
    return NUMBER_BASED_COMPARE_OPERATORS
  }

  rawData2JSON(rawData: number) {
    return rawData
  }

  getCellContent(rawData: number | undefined): NumberCell {
    return {
      kind: GridCellKind.Number,
      data: rawData,
      displayData: rawData == null ? "" : `${rawData}`,
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: NumberCell) {
    return {
      rawData: cell.data ?? null,
    }
  }
}
