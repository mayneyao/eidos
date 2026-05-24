import { z } from "zod"
import type { TextCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import { FieldType, GridCellKind, TEXT_BASED_COMPARE_OPERATORS } from "./const"
import type { IVecMeta } from "../sdk/service/text"

export interface TextProperty {
  model?: string | null
  enableEmbedding?: boolean | null
  enableColorHint?: boolean | null
}

export const TextPropertySchema = z.object({
  model: z.string().nullable().optional(),
  enableEmbedding: z.boolean().nullable().optional(),
  enableColorHint: z.boolean().nullable().optional(),
})

// Define an interface for the context object
interface CellContext {
  row: Record<string, any>
  theme?: "dark" | "light" // Optional theme property
}

export class TextField extends BaseField<TextCell, TextProperty> {
  static type = FieldType.Text

  get compareOperators() {
    return TEXT_BASED_COMPARE_OPERATORS
  }

  rawData2JSON(rawData: string) {
    return rawData
  }

  // Update the method signature to use CellContext
  getCellContent(rawData: string | null, context?: CellContext): TextCell {
    // Access the theme from context, default to 'light' if not provided
    const theme = context?.theme ?? "light"

    // Define theme-based colors
    const outdatedColor = theme === "dark" ? "#664D03" : "#FFFBE6" // Example dark/light yellow
    const upToDateColor = theme === "dark" ? "#1F4B2D" : "#E6FFEC" // Example dark/light green

    if (
      !this.column.property?.enableEmbedding ||
      !this.column.property?.enableColorHint
    ) {
      return {
        kind: GridCellKind.Text,
        data: rawData ? rawData + "" : "",
        displayData: rawData ? rawData + "" : "",
        allowOverlay: true,
      }
    }
    const fieldId = this.column.table_column_name
    const vecMetaFieldId = `${fieldId}__vec_meta`
    const vecMeta = context?.row?.[vecMetaFieldId]
      ? (JSON.parse(context.row[vecMetaFieldId]) as IVecMeta)
      : null
    const isCellOutOfDate = vecMeta?.outOfDate

    if (isCellOutOfDate) {
      return {
        kind: GridCellKind.Text,
        data: rawData ? rawData + "" : "",
        displayData: rawData ? rawData + "" : "",
        allowOverlay: true,
        themeOverride: {
          // Use the theme-based color
          bgCell: outdatedColor,
        },
      }
    }
    if (vecMeta) {
      return {
        kind: GridCellKind.Text,
        data: rawData ? rawData + "" : "",
        displayData: rawData ? rawData + "" : "",
        allowOverlay: true,
        themeOverride: {
          // Use the theme-based color
          bgCell: upToDateColor,
        },
      }
    }
    return {
      kind: GridCellKind.Text,
      data: rawData ? rawData + "" : "",
      displayData: rawData ? rawData + "" : "",
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: TextCell) {
    return {
      rawData: cell.data || null,
    }
  }
}
