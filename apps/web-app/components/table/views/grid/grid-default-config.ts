import type { DataEditorProps } from "@glideapps/glide-data-grid"

import { headerIcons } from "@/components/table/fields/header-icons"

export const defaultConfig: Partial<DataEditorProps> = {
  smoothScrollX: true,
  smoothScrollY: true,
  getCellsForSelection: true,
  width: "100%",
  rowHeight: 36,
  headerHeight: 36,
  freezeColumns: 1,
  rowMarkers: { kind: "both" },
  trailingRowOptions: {
    tint: false,
    hint: "New",
    sticky: true,
  },
  onPaste: true,
  headerIcons,
  experimental: { kineticScrollPerfHack: true },
}

let scrollbarWidthCache: number | null = null

export function getScrollbarWidth(): number {
  if (scrollbarWidthCache !== null) return scrollbarWidthCache
  const outer = document.createElement("div")
  outer.style.visibility = "hidden"
  outer.style.width = "100px"
  document.body.appendChild(outer)

  const widthNoScroll = outer.offsetWidth
  outer.style.overflow = "scroll"
  const inner = document.createElement("div")
  inner.style.width = "100%"
  outer.appendChild(inner)
  const widthWithScroll = inner.offsetWidth
  outer.remove()
  scrollbarWidthCache = widthNoScroll - widthWithScroll
  return scrollbarWidthCache
}
