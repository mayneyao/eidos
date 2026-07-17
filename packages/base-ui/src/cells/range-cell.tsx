import * as React from "react"
import { baseOptionColor } from "../base-field-properties"
import {
  GridCellKind,
  getMiddleCenterBias,
  measureTextCached,
  type CustomCell,
  type CustomRenderer,
} from "@glideapps/glide-data-grid"

import { roundedRect } from "./grid-cell-helper"
import NumberOverlayEditor from "./number-overlay-editor"

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

const RANGE_HEIGHT = 6

const renderer: CustomRenderer<RangeCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is RangeCell => (c.data as any).kind === "range-cell",
  draw: (args, cell) => {
    const { ctx, theme, rect } = args
    const { min, max, value, label, measureLabel, color } = cell.data
    if (value === undefined) {
      return true
    }

    const x = rect.x + theme.cellHorizontalPadding
    const yMid = rect.y + rect.height / 2

    const rangeSize = max - min
    const fillRatio = Math.max(0, Math.min(1, (value - min) / rangeSize))

    ctx.save()
    let labelWidth = 0
    if (label !== undefined) {
      ctx.font = `12px ${theme.fontFamily}` // fixme this is slow
      labelWidth =
        measureTextCached(
          measureLabel ?? label,
          ctx,
          `12px ${theme.fontFamily}`
        ).width + theme.cellHorizontalPadding
    }

    const rangeWidth = rect.width - theme.cellHorizontalPadding * 2 - labelWidth
    const currentTheme = (theme as any).name
    const colorHex = baseOptionColor(
      color ?? "default",
      currentTheme === "dark" ? "dark" : "light"
    )
    if (rangeWidth >= RANGE_HEIGHT) {
      const gradient = ctx.createLinearGradient(x, yMid, x + rangeWidth, yMid)

      gradient.addColorStop(0, colorHex)
      gradient.addColorStop(fillRatio, colorHex)
      gradient.addColorStop(fillRatio, theme.bgBubble)
      gradient.addColorStop(1, theme.bgBubble)

      ctx.beginPath()
      ctx.fillStyle = gradient
      roundedRect(
        ctx,
        x,
        yMid - RANGE_HEIGHT / 2,
        rangeWidth,
        RANGE_HEIGHT,
        RANGE_HEIGHT / 2
      )
      ctx.fill()

      ctx.beginPath()
      roundedRect(
        ctx,
        x + 0.5,
        yMid - RANGE_HEIGHT / 2 + 0.5,
        rangeWidth - 1,
        RANGE_HEIGHT - 1,
        (RANGE_HEIGHT - 1) / 2
      )
      ctx.strokeStyle = theme.accentLight
      ctx.lineWidth = 1
      ctx.stroke()
    }

    if (label !== undefined) {
      ctx.textAlign = "right"
      ctx.fillStyle = theme.textDark
      ctx.fillText(
        label,
        rect.x + rect.width - theme.cellHorizontalPadding,
        yMid + getMiddleCenterBias(ctx, `12px ${theme.fontFamily}`)
      )
    }

    ctx.restore()

    return true
  },
  provideEditor: () => (p) => {
    const { isHighlighted, onChange, value, validatedSelection } = p
    return (
      <React.Suspense fallback={null}>
        <NumberOverlayEditor
          highlight={isHighlighted}
          disabled={value.readonly === true}
          value={value.data.value}
          // fixedDecimals={value.fixedDecimals}
          // allowNegative={value.allowNegative}
          // thousandSeparator={value.thousandSeparator}
          // decimalSeparator={value.decimalSeparator}
          validatedSelection={validatedSelection}
          onChange={(x) =>
            onChange({
              ...value,
              data: {
                ...value.data,
                value: Number.isNaN(x.floatValue ?? 0)
                  ? 0
                  : (x.floatValue as number),
              } as RangeCellProps,
            })
          }
        />
      </React.Suspense>
    )
  },
  onPaste: (v, d) => {
    let num = Number.parseFloat(v)
    num = Number.isNaN(num) ? d.value : Math.max(d.min, Math.min(d.max, num))
    return {
      ...d,
      value: num,
    }
  },
}

export default renderer
