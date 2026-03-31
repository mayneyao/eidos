import { SelectField } from "@/packages/core/fields/select"
import type { FormulaOptionCell } from "@/packages/core/fields/interface"
import {
  GridCellKind,
  getMiddleCenterBias,
  measureTextCached,
  type CustomRenderer,
} from "@glideapps/glide-data-grid"

import { roundedRect } from "./helper"

const renderer: CustomRenderer<FormulaOptionCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is FormulaOptionCell =>
    (c.data as any).kind === "formula-option-cell",
  draw: (args, cell) => {
    const { ctx, theme, rect } = args
    const { value, color } = cell.data

    if (!value) {
      return true
    }

    const currentTheme = (theme as any).name as "light" | "dark"
    const colorHex = SelectField.getColorValue(color ?? "default", currentTheme)

    const tagHeight = 20
    const innerPad = 6

    const metrics = measureTextCached(value, ctx)
    const width = Math.min(
      metrics.width + innerPad * 2,
      rect.width - 2 * theme.cellHorizontalPadding
    )

    const x = rect.x + theme.cellHorizontalPadding
    const y = rect.y + (rect.height - tagHeight) / 2

    // Draw tag background
    ctx.fillStyle = colorHex
    ctx.beginPath()
    roundedRect(ctx, x, y, width, tagHeight, 4)
    ctx.fill()

    // Draw text
    ctx.fillStyle = theme.textDark
    ctx.fillText(
      value,
      x + innerPad,
      rect.y + rect.height / 2 + getMiddleCenterBias(ctx, theme)
    )

    return true
  },
  // Read-only, no editor needed
  provideEditor: undefined,
}

export default renderer
