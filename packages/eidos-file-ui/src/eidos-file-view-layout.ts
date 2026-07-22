import type {
  EidosFileFieldInfo,
  EidosFileRowRange,
  EidosFileSort,
  EidosFileSortDirection,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import type { GridSelection } from "@glideapps/glide-data-grid"

import {
  eidosFileFieldKey,
  eidosFileViewVisibleSystemFields,
  visibleEidosFileFields,
} from "./eidos-file-field-visibility"

export function orderedEidosFileFields(
  fields: EidosFileFieldInfo[],
  view?: EidosFileViewInfo
): EidosFileFieldInfo[] {
  return visibleEidosFileFields(
    fields,
    view?.hiddenFields,
    eidosFileViewVisibleSystemFields(view)
  ).sort((left, right) => {
    const leftOrder = view?.orderMap?.[eidosFileFieldKey(left)]
    const rightOrder = view?.orderMap?.[eidosFileFieldKey(right)]
    return (
      (leftOrder ?? Number.MAX_SAFE_INTEGER) -
      (rightOrder ?? Number.MAX_SAFE_INTEGER)
    )
  })
}

export function eidosFileViewFreezeColumns(
  view: EidosFileViewInfo | undefined,
  fieldCount: number
): number {
  const value = view?.properties?.freezeColumns
  const requested =
    typeof value === "number" && Number.isFinite(value) ? value : 1
  return Math.min(fieldCount, Math.max(0, Math.trunc(requested)))
}

export function nextEidosFileFieldSorts(
  sorts: EidosFileSort[],
  field: string,
  direction: EidosFileSortDirection | null
): EidosFileSort[] {
  const remaining = sorts.filter((sort) => sort.field !== field)
  return direction ? [{ field, direction }, ...remaining] : remaining
}

export function rowSelectionRanges(
  selection: GridSelection
): EidosFileRowRange[] {
  const compactRanges = (
    selection.rows as unknown as {
      items?: readonly (readonly [number, number])[]
    }
  ).items
  if (compactRanges) {
    return compactRanges.map(([startIndex, endIndex]) => ({
      startIndex,
      endIndex,
    }))
  }

  const ranges: EidosFileRowRange[] = []
  for (const index of selection.rows) {
    const previous = ranges.at(-1)
    if (previous?.endIndex === index) {
      previous.endIndex = index + 1
    } else {
      ranges.push({ startIndex: index, endIndex: index + 1 })
    }
  }
  return ranges
}

function includesRow(range: EidosFileRowRange, rowIndex: number): boolean {
  return rowIndex >= range.startIndex && rowIndex < range.endIndex
}

export function contextRowRanges(
  selection: GridSelection | undefined,
  rowIndex: number
): EidosFileRowRange[] {
  if (selection) {
    const rowRanges = rowSelectionRanges(selection)
    if (rowRanges.some((range) => includesRow(range, rowIndex))) {
      return rowRanges
    }
    const current = selection.current?.range
    if (
      current &&
      rowIndex >= current.y &&
      rowIndex < current.y + current.height
    ) {
      return [
        {
          startIndex: current.y,
          endIndex: current.y + current.height,
        },
      ]
    }
  }
  return [{ startIndex: rowIndex, endIndex: rowIndex + 1 }]
}

export function rowRangeCount(ranges: EidosFileRowRange[]): number {
  return ranges.reduce(
    (count, range) => count + Math.max(0, range.endIndex - range.startIndex),
    0
  )
}
