import type {
  BaseFieldInfo,
  BaseRowRange,
  BaseSort,
  BaseSortDirection,
  BaseViewInfo,
} from "@eidos.space/base"
import type { GridSelection } from "@glideapps/glide-data-grid"

import { visibleBaseFields } from "./base-grid-adapter"

export function orderedBaseFields(
  fields: BaseFieldInfo[],
  view?: BaseViewInfo
): BaseFieldInfo[] {
  return visibleBaseFields(fields, view?.hiddenFields).sort((left, right) => {
    const leftOrder = view?.orderMap?.[left.tableColumnName]
    const rightOrder = view?.orderMap?.[right.tableColumnName]
    return (
      (leftOrder ?? Number.MAX_SAFE_INTEGER) -
      (rightOrder ?? Number.MAX_SAFE_INTEGER)
    )
  })
}

export function baseViewFreezeColumns(
  view: BaseViewInfo | undefined,
  fieldCount: number
): number {
  const value = view?.properties?.freezeColumns
  const requested =
    typeof value === "number" && Number.isFinite(value) ? value : 1
  return Math.min(fieldCount, Math.max(0, Math.trunc(requested)))
}

export function nextBaseFieldSorts(
  sorts: BaseSort[],
  field: string,
  direction: BaseSortDirection | null
): BaseSort[] {
  const remaining = sorts.filter((sort) => sort.field !== field)
  return direction ? [{ field, direction }, ...remaining] : remaining
}

export function rowSelectionRanges(selection: GridSelection): BaseRowRange[] {
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

  const ranges: BaseRowRange[] = []
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

function includesRow(range: BaseRowRange, rowIndex: number): boolean {
  return rowIndex >= range.startIndex && rowIndex < range.endIndex
}

export function contextRowRanges(
  selection: GridSelection | undefined,
  rowIndex: number
): BaseRowRange[] {
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

export function rowRangeCount(ranges: BaseRowRange[]): number {
  return ranges.reduce(
    (count, range) => count + Math.max(0, range.endIndex - range.startIndex),
    0
  )
}
