import type { CustomCell } from "@glideapps/glide-data-grid"
import { BaseField } from "./base"
import {
  FieldType,
  GridCellKind,
  NUMBER_BASED_COMPARE_OPERATORS,
} from "./const"

type RatingProperty = {}

interface RatingCellProps {
  readonly kind: "rating-cell"
  readonly rating: number
}

export type RatingCell = CustomCell<RatingCellProps>

export class RatingField extends BaseField<RatingCell, RatingProperty, number> {
  static type = FieldType.Rating

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
