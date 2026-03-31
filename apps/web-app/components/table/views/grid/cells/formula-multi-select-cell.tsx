import { SelectField } from "@/packages/core/fields/select"
import type { FormulaMultiSelectCell } from "@/packages/core/fields/interface"
import {
  GridCellKind,
  getMiddleCenterBias,
  measureTextCached,
  type CustomRenderer,
} from "@glideapps/glide-data-grid"

import { roundedRect } from "./helper"

const TAG_HEIGHT = 20
const TAG_PADDING = 6
const TAG_GAP = 4

const renderer: CustomRenderer<FormulaMultiSelectCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is FormulaMultiSelectCell =>
    (c.data as any).kind === "formula-multi-select-cell",
  draw: (args, cell) => {
    const { ctx, theme, rect } = args
    const { values } = cell.data

    if (!values || values.length === 0) {
      return true
    }

    const currentTheme = (theme as any).name as "light" | "dark"
    const maxWidth = rect.width - 2 * theme.cellHorizontalPadding

    let x = rect.x + theme.cellHorizontalPadding
    const yMid = rect.y + rect.height / 2

    ctx.save()

    for (const item of values) {
      const colorHex = SelectField.getColorValue(
        item.color ?? "default",
        currentTheme
      )

      const metrics = measureTextCached(item.value, ctx)
      const tagWidth = metrics.width + TAG_PADDING * 2

      // Check if tag fits, if not skip remaining
      if (x + tagWidth > rect.x + rect.width - theme.cellHorizontalPadding) {
        break
      }

      const y = yMid - TAG_HEIGHT / 2

      // Draw tag background
      ctx.fillStyle = colorHex
      ctx.beginPath()
      roundedRect(ctx, x, y, tagWidth, TAG_HEIGHT, 4)
      ctx.fill()

      // Draw text
      ctx.fillStyle = theme.textDark
      ctx.fillText(
        item.value,
        x + TAG_PADDING,
        yMid + getMiddleCenterBias(ctx, theme)
      )

      x += tagWidth + TAG_GAP
    }

    ctx.restore()

    return true
  },
  // Read-only, no editor needed
  provideEditor: undefined,
}

export default renderer
