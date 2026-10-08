import type { PluginResourceRect } from "../shared/plugins"

export function resourceClipPath(r: PluginResourceRect): string {
  const left = r.clipLeft,
    top = r.clipTop
  const right = Math.max(left, r.width - r.clipRight)
  const bottom = Math.max(top, r.height - r.clipBottom)
  const rectangle = (x: number, y: number, endX: number, endY: number) =>
    `M${x} ${y}H${endX}V${endY}H${x}Z`
  let path = rectangle(left, top, right, bottom)
  const menu = r.occlusions?.[0]
  if (menu) {
    const x = Math.max(left, menu.x),
      y = Math.max(top, menu.y)
    const endX = Math.min(right, menu.x + menu.width),
      endY = Math.min(bottom, menu.y + menu.height)
    if (endX > x && endY > y) path += rectangle(x, y, endX, endY)
  }
  return `path(evenodd, "${path}")`
}
