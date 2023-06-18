import { GridCellKind } from "@glideapps/glide-data-grid"
import { StarCell } from "@glideapps/glide-data-grid-cells"

import { BaseField } from "./base"
import { InferCustomRendererType } from "./interface"

type RatingProperty = {}

type RatingCell = InferCustomRendererType<typeof StarCell>

export class RatingField extends BaseField<RatingCell, RatingProperty, number> {
  static type = "rating"

  getCellContent(rawData: number): RatingCell {
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "star-cell",
        rating: rawData,
      },
      copyData: `${rawData}`,
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: RatingCell) {
    return cell.data.rating
  }
}
