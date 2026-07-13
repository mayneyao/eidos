import type { BaseRow, BaseRowPage } from "@eidos.space/base"

export type BaseRowWindowMergeMode = "append" | "prepend" | "replace"

export interface BaseRowWindow {
  rows: BaseRow[]
  startOffset: number
  total: number
  nextCursor?: string
}

export interface BaseRowWindowRequest {
  mode: BaseRowWindowMergeMode
  offset: number
}

function uniqueRows(rows: BaseRow[]): BaseRow[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const id = String(row._id ?? "")
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

export function rowFromWindow(
  window: BaseRowWindow,
  absoluteIndex: number
): BaseRow | undefined {
  const localIndex = absoluteIndex - window.startOffset
  return localIndex >= 0 ? window.rows[localIndex] : undefined
}

export function mergeRowWindowPage(
  current: BaseRowWindow,
  page: BaseRowPage,
  mode: BaseRowWindowMergeMode,
  maxRows: number
): BaseRowWindow {
  const limit = Math.max(1, Math.trunc(maxRows))
  const total =
    page.rows.length === 0 && page.offset > 0
      ? Math.min(page.total, page.offset)
      : page.total
  if (mode === "replace" || current.rows.length === 0) {
    return {
      rows: uniqueRows(page.rows).slice(0, limit),
      startOffset: page.offset,
      total,
      nextCursor: page.nextCursor,
    }
  }

  if (mode === "prepend") {
    const pageEnd = page.offset + page.rows.length
    if (pageEnd < current.startOffset) {
      return {
        rows: uniqueRows(page.rows).slice(0, limit),
        startOffset: page.offset,
        total,
        nextCursor: undefined,
      }
    }
    const overlap = Math.max(0, pageEnd - current.startOffset)
    return {
      rows: uniqueRows([
        ...page.rows,
        ...current.rows.slice(Math.min(overlap, current.rows.length)),
      ]).slice(0, limit),
      startOffset: page.offset,
      total,
      nextCursor: undefined,
    }
  }

  const currentEnd = current.startOffset + current.rows.length
  if (page.offset > currentEnd) {
    return {
      rows: uniqueRows(page.rows).slice(-limit),
      startOffset: Math.max(
        page.offset,
        page.offset + page.rows.length - limit
      ),
      total,
      nextCursor: page.nextCursor,
    }
  }
  const overlap = Math.max(0, currentEnd - page.offset)
  const merged = uniqueRows([
    ...current.rows,
    ...page.rows.slice(Math.min(overlap, page.rows.length)),
  ])
  const overflow = Math.max(0, merged.length - limit)
  return {
    rows: merged.slice(overflow),
    startOffset: current.startOffset + overflow,
    total,
    nextCursor: page.nextCursor,
  }
}

export function requestForRowWindow(
  window: BaseRowWindow,
  visibleStart: number,
  visibleEnd: number,
  pageSize: number
): BaseRowWindowRequest | null {
  if (window.total <= 0 || visibleEnd <= visibleStart) return null
  const size = Math.max(1, Math.trunc(pageSize))
  const start = Math.max(0, Math.min(visibleStart, window.total - 1))
  const end = Math.max(start + 1, Math.min(visibleEnd, window.total))
  const windowEnd = window.startOffset + window.rows.length

  if (window.rows.length === 0) {
    return { mode: "replace", offset: Math.floor(start / size) * size }
  }
  if (end <= window.startOffset) {
    return window.startOffset - end <= size
      ? {
          mode: "prepend",
          offset: Math.max(0, window.startOffset - size),
        }
      : { mode: "replace", offset: Math.floor(start / size) * size }
  }
  if (start >= windowEnd) {
    return start - windowEnd < size
      ? { mode: "append", offset: windowEnd }
      : { mode: "replace", offset: Math.floor(start / size) * size }
  }
  if (start < window.startOffset) {
    return {
      mode: "prepend",
      offset: Math.max(0, window.startOffset - size),
    }
  }
  if (end > windowEnd && windowEnd < window.total) {
    return { mode: "append", offset: windowEnd }
  }
  return null
}

export function requestForPrefetchedRowWindow(
  window: BaseRowWindow,
  visibleStart: number,
  visibleEnd: number,
  pageSize: number,
  prefetchRows: number
): BaseRowWindowRequest | null {
  const visibleRequest = requestForRowWindow(
    window,
    visibleStart,
    visibleEnd,
    pageSize
  )
  if (visibleRequest) return visibleRequest

  const margin = Math.max(0, Math.trunc(prefetchRows))
  if (margin === 0) return null
  return requestForRowWindow(
    window,
    Math.max(0, visibleStart - margin),
    Math.min(window.total, visibleEnd + margin),
    pageSize
  )
}
