import type { CustomCell, NumberCell } from "@glideapps/glide-data-grid"
import { z } from "zod"

import { BaseField } from "./base"
import {
  FieldType,
  GridCellKind,
  NUMBER_BASED_COMPARE_OPERATORS,
} from "./const"

interface RangeCellProps {
  readonly kind: "range-cell"
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly label?: string
  readonly measureLabel?: string
  readonly color?: string
}

export type RangeCell = CustomCell<RangeCellProps>

export type NumberProperty = {
  format: "number" | "percent" | "currency"
  showAs: "number" | "bar" | "ring"
  color: string
  divideBy: number
  showNumber: boolean
}

export const NumberPropertySchema = z.object({
  format: z.enum(["number", "percent", "currency"]).optional(),
  showAs: z.enum(["number", "bar", "ring"]).optional(),
  color: z.string().optional(),
  divideBy: z.number().optional(),
  showNumber: z.boolean().optional(),
})

export class NumberField extends BaseField<
  NumberCell | RangeCell,
  NumberProperty,
  number
> {
  static type = FieldType.Number

  get compareOperators() {
    return NUMBER_BASED_COMPARE_OPERATORS
  }

  rawData2JSON(rawData: number) {
    return rawData
  }

  getCellContent(rawData: number | undefined): NumberCell | RangeCell {
    // if rawData is undefined, we will display a blank cell
    if (rawData == null) {
      return {
        kind: GridCellKind.Number,
        data: undefined,
        displayData: "",
        allowOverlay: true,
      }
    }
    if (this.column.property?.showAs === "bar") {
      return {
        kind: GridCellKind.Custom,
        data: {
          kind: "range-cell",
          min: 0,
          max: this.column.property?.divideBy || 100,
          step: 1,
          label: this.column.property?.showNumber
            ? (rawData?.toString() ?? "")
            : "",
          value: rawData ?? 0,
          color: this.column.property?.color,
        },
        copyData: rawData?.toString() ?? "",
        allowOverlay: true,
      }
    }
    return {
      kind: GridCellKind.Number,
      data: rawData,
      displayData: rawData == null ? "" : `${rawData}`,
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: NumberCell | RangeCell) {
    if (cell.kind === GridCellKind.Custom) {
      return {
        rawData: cell.data.value,
      }
    }
    return {
      rawData: cell.data ?? null,
    }
  }
}
