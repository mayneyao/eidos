import type { RatingCell } from "@/components/grid/cells/rating-cell"

import { BaseField } from "./base"
import {
  CompareOperator,
  GridCellKind,
  NUMBER_BASED_COMPARE_OPERATORS,
} from "./const"

type RatingProperty = {}

export class RatingField extends BaseField<RatingCell, RatingProperty, number> {
  static type = "rating"

  get compareOperators() {
    return NUMBER_BASED_COMPARE_OPERATORS
  }

  rawData2JSON(rawData: number) {
    return rawData
  }

  getCellContent(rawData: number): RatingCell {
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "rating-cell",
        rating: rawData,
      },
      copyData: `${rawData}`,
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: RatingCell) {
    return {
      rawData: cell.data.rating ?? null,
    }
  }
}
