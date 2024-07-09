// code from https://github.com/glideapps/glide-data-grid/blob/main/packages/core/src/data-grid/data-grid-lib.ts

import { BaseDrawArgs, BaseGridCell, Theme } from "@glideapps/glide-data-grid"

import { LinkCellData } from "@/lib/fields/link"

interface CornerRadius {
  tl: number
  tr: number
  bl: number
  br: number
}

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | CornerRadius
) {
  if (radius === 0) {
    ctx.rect(x, y, width, height)
    return
  }
  if (typeof radius === "number") {
    radius = { tl: radius, tr: radius, br: radius, bl: radius }
  }

  // restrict radius to a reasonable max
  radius = {
    tl: Math.min(radius.tl, height / 2, width / 2),
    tr: Math.min(radius.tr, height / 2, width / 2),
    bl: Math.min(radius.bl, height / 2, width / 2),
    br: Math.min(radius.br, height / 2, width / 2),
  }

  ctx.moveTo(x + radius.tl, y)
  ctx.arcTo(x + width, y, x + width, y + radius.tr, radius.tr)
  ctx.arcTo(x + width, y + height, x + width - radius.br, y + height, radius.br)
  ctx.arcTo(x, y + height, x, y + height - radius.bl, radius.bl)
  ctx.arcTo(x, y, x + radius.tl, y, radius.tl)
}

export const removeItemFromArray = (_arr: any[], item: any) => {
  const arr = [..._arr]
  const index = arr.indexOf(item)
  if (index !== -1) {
    arr.splice(index, 1)
  }
  return arr
}

const itemMargin = 4

const drilldownCache: {
  [key: string]: HTMLCanvasElement
} = {}

const biasCache: { key: string; val: number }[] = []

let metricsSize = 0
let metricsCache: Record<string, TextMetrics | undefined> = {}

function loadMetric(
  ctx: CanvasRenderingContext2D,
  baseline: "alphabetic" | "middle"
) {
  const sample = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

  ctx.save()
  ctx.textBaseline = baseline
  const result = ctx.measureText(sample)

  ctx.restore()

  return result
}

function getMiddleCenterBiasInner(
  ctx: CanvasRenderingContext2D,
  font: string
): number {
  for (const x of biasCache) {
    if (x.key === font) return x.val
  }

  const alphabeticMetrics = loadMetric(ctx, "alphabetic")
  const middleMetrics = loadMetric(ctx, "middle")

  const bias =
    -(
      middleMetrics.actualBoundingBoxDescent -
      alphabeticMetrics.actualBoundingBoxDescent
    ) +
    alphabeticMetrics.actualBoundingBoxAscent / 2

  biasCache.push({
    key: font,
    val: bias,
  })

  return bias
}

/** @category Drawing */
export function getMiddleCenterBias(
  ctx: CanvasRenderingContext2D,
  font: string | Theme
): number {
  if (typeof font !== "string") {
    font = `${font.baseFontStyle} ${font.fontFamily}`
  }
  return getMiddleCenterBiasInner(ctx, font)
}

function makeCacheKey(
  s: string,
  ctx: CanvasRenderingContext2D,
  baseline: "alphabetic" | "middle",
  font?: string
) {
  return `${s}_${font ?? ctx.font}_${baseline}`
}

/** @category Drawing */
export function measureTextCached(
  s: string,
  ctx: CanvasRenderingContext2D,
  font?: string
): TextMetrics {
  const key = makeCacheKey(s, ctx, "middle", font)
  let metrics = metricsCache[key]
  if (metrics === undefined) {
    metrics = ctx.measureText(s)
    metricsCache[key] = metrics
    metricsSize++
  }

  if (metricsSize > 10_000) {
    metricsCache = {}
    metricsSize = 0
  }

  return metrics
}

function getEmHeight(ctx: CanvasRenderingContext2D, fontStyle: string): number {
  const textMetrics = measureTextCached("ABCi09jgqpy", ctx, fontStyle) // do not question the magic string
  return (
    textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent
  )
}

function getAndCacheDrilldownBorder(
  bgCell: string,
  border: string,
  height: number
): {
  el: HTMLCanvasElement
  height: number
  width: number
  middleWidth: number
  sideWidth: number
  dpr: number
  padding: number
} | null {
  const dpr = Math.ceil(window.devicePixelRatio)
  const shadowBlur = 5
  const targetHeight = height - shadowBlur * 2
  const middleWidth = 4
  const rounding = 6

  const innerHeight = height * dpr
  const sideWidth = rounding + shadowBlur
  const targetWidth = rounding * 3
  const innerWidth = (targetWidth + shadowBlur * 2) * dpr

  const key = `${bgCell},${border},${dpr},${height}`
  if (drilldownCache[key] !== undefined) {
    return {
      el: drilldownCache[key],
      height: innerHeight,
      width: innerWidth,
      middleWidth: middleWidth * dpr,
      sideWidth: sideWidth * dpr,
      padding: shadowBlur * dpr,
      dpr,
    }
  }

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d") // alpha needed

  if (ctx === null) return null

  canvas.width = innerWidth
  canvas.height = innerHeight

  ctx.scale(dpr, dpr)

  drilldownCache[key] = canvas

  const trueRounding = Math.min(rounding, targetWidth / 2, targetHeight / 2)
  ctx.beginPath()
  roundedRect(
    ctx,
    shadowBlur,
    shadowBlur,
    targetWidth,
    targetHeight,
    trueRounding
  )

  ctx.shadowColor = "rgba(24, 25, 34, 0.4)"
  ctx.shadowBlur = 1
  ctx.fillStyle = bgCell
  ctx.fill()

  ctx.shadowColor = "rgba(24, 25, 34, 0.3)"
  ctx.shadowOffsetY = 1
  ctx.shadowBlur = 5
  ctx.fillStyle = bgCell
  ctx.fill()

  ctx.shadowOffsetY = 0
  ctx.shadowBlur = 0
  ctx.shadowBlur = 0

  ctx.beginPath()
  roundedRect(
    ctx,
    shadowBlur + 0.5,
    shadowBlur + 0.5,
    targetWidth,
    targetHeight,
    trueRounding
  )

  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.stroke()

  return {
    el: canvas,
    height: innerHeight,
    width: innerWidth,
    sideWidth: sideWidth * dpr,
    middleWidth: rounding * dpr,
    padding: shadowBlur * dpr,
    dpr,
  }
}

export function drawDrilldownCell(
  args: BaseDrawArgs,
  data: readonly LinkCellData[]
) {
  const { rect, theme, ctx, imageLoader, col, row } = args
  const { x, width: w } = rect

  const font = `${theme.baseFontStyle} ${theme.fontFamily}`
  const emHeight = getEmHeight(ctx, font)
  const h = Math.min(
    rect.height,
    Math.max(16, Math.ceil(emHeight * theme.lineHeight) * 2)
  )
  const y = Math.floor(rect.y + (rect.height - h) / 2)

  const bubbleHeight = h - 10
  const bubblePad = 8
  const bubbleMargin = itemMargin
  let renderX = x + theme.cellHorizontalPadding

  const tileMap = getAndCacheDrilldownBorder(
    theme.bgCell,
    theme.drilldownBorder,
    h
  )

  const renderBoxes: { x: number; width: number }[] = []
  for (const el of data) {
    if (renderX > x + w) break
    const textMetrics = measureTextCached(el.title, ctx, font)
    const textWidth = textMetrics.width
    let imgWidth = 0
    if (el.img !== undefined) {
      const img = imageLoader.loadOrGetImage(el.img, col, row)
      if (img !== undefined) {
        imgWidth = bubbleHeight - 8 + 4
      }
    }
    const renderWidth = textWidth + imgWidth + bubblePad * 2
    renderBoxes.push({
      x: renderX,
      width: renderWidth,
    })

    renderX += renderWidth + bubbleMargin
  }

  if (tileMap !== null) {
    const { el, height, middleWidth, sideWidth, width, dpr, padding } = tileMap
    const outerSideWidth = sideWidth / dpr
    const outerPadding = padding / dpr
    for (const rectInfo of renderBoxes) {
      const rx = Math.floor(rectInfo.x)
      const rw = Math.floor(rectInfo.width)
      const outerMiddleWidth = rw - (outerSideWidth - outerPadding) * 2
      ctx.imageSmoothingEnabled = false

      ctx.drawImage(
        el,
        0,
        0,
        sideWidth,
        height,
        rx - outerPadding,
        y,
        outerSideWidth,
        h
      )
      if (outerMiddleWidth > 0)
        ctx.drawImage(
          el,
          sideWidth,
          0,
          middleWidth,
          height,
          rx + (outerSideWidth - outerPadding),
          y,
          outerMiddleWidth,
          h
        )
      ctx.drawImage(
        el,
        width - sideWidth,
        0,
        sideWidth,
        height,
        rx + rw - (outerSideWidth - outerPadding),
        y,
        outerSideWidth,
        h
      )
      ctx.imageSmoothingEnabled = true
    }
  }

  ctx.beginPath()

  for (const [i, rectInfo] of renderBoxes.entries()) {
    const d = data[i]
    let drawX = rectInfo.x + bubblePad

    if (d.img !== undefined) {
      const img = imageLoader.loadOrGetImage(d.img, col, row)
      if (img !== undefined) {
        const imgSize = bubbleHeight - 8
        let srcX = 0
        let srcY = 0
        let srcWidth = img.width
        let srcHeight = img.height

        if (srcWidth > srcHeight) {
          // landscape
          srcX += (srcWidth - srcHeight) / 2
          srcWidth = srcHeight
        } else if (srcHeight > srcWidth) {
          //portrait
          srcY += (srcHeight - srcWidth) / 2
          srcHeight = srcWidth
        }
        ctx.beginPath()
        roundedRect(ctx, drawX, y + h / 2 - imgSize / 2, imgSize, imgSize, 3)
        ctx.save()
        ctx.clip()
        ctx.drawImage(
          img,
          srcX,
          srcY,
          srcWidth,
          srcHeight,
          drawX,
          y + h / 2 - imgSize / 2,
          imgSize,
          imgSize
        )
        ctx.restore()

        drawX += imgSize + 4
      }
    }

    ctx.beginPath()
    ctx.fillStyle = theme.textBubble
    ctx.fillText(d.title, drawX, y + h / 2 + getMiddleCenterBias(ctx, theme))
  }
}

export function drawImage(
  args: BaseDrawArgs,
  data: readonly string[],
  rounding: number = 4,
  contentAlign?: BaseGridCell["contentAlign"]
) {
  const { rect, col, row, theme, ctx, imageLoader } = args
  const { x, y, height: h, width: w } = rect
  const imgHeight = h - theme.cellVerticalPadding * 2
  const images: (HTMLImageElement | ImageBitmap)[] = []
  let totalWidth = 0
  for (let index = 0; index < data.length; index++) {
    const i = data[index]
    if (i.length === 0) continue
    const img = imageLoader.loadOrGetImage(i, col, row)

    if (img !== undefined) {
      images[index] = img
      const imgWidth = img.width * (imgHeight / img.height)
      totalWidth += imgWidth + itemMargin
    }
  }

  if (totalWidth === 0) return
  totalWidth -= itemMargin

  let drawX = x + theme.cellHorizontalPadding
  if (contentAlign === "right")
    drawX = Math.floor(x + w - theme.cellHorizontalPadding - totalWidth)
  else if (contentAlign === "center")
    drawX = Math.floor(x + w / 2 - totalWidth / 2)

  for (const img of images) {
    if (img === undefined) continue //array is sparse
    const imgWidth = img.width * (imgHeight / img.height)
    if (rounding > 0) {
      roundedRect(
        ctx,
        drawX,
        y + theme.cellVerticalPadding,
        imgWidth,
        imgHeight,
        rounding
      )
      ctx.save()
      ctx.clip()
    }
    ctx.drawImage(
      img,
      drawX,
      y + theme.cellVerticalPadding,
      imgWidth,
      imgHeight
    )
    if (rounding > 0) {
      ctx.restore()
    }

    drawX += imgWidth + itemMargin
  }
}
