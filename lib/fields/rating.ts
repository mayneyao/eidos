import type { RatingCell } from "@/components/grid/cells/rating-cell"

import { BaseField } from "./base"
import { GridCellKind } from "./const"

type RatingProperty = {}

export class RatingField extends BaseField<RatingCell, RatingProperty, number> {
  static type = "rating"

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
      rawData: cell.data.rating,
    }
  }
}
