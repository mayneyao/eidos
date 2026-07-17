import type { EidosFileRowPage } from "@eidos.space/eidos-file"
import { describe, expect, it } from "vitest"

import {
  mergeRowWindowPage,
  requestForPrefetchedRowWindow,
  requestForRowWindow,
  rowFromWindow,
  type EidosFileRowWindow,
} from "./eidos-file-row-window"

function page(offset: number, count: number, total = 1_000): EidosFileRowPage {
  return {
    tableId: "tasks",
    offset,
    limit: count,
    total,
    rows: Array.from({ length: count }, (_, index) => ({
      _id: `row_${offset + index}`,
      title: `Row ${offset + index}`,
    })),
  }
}

describe("Eidos File row window", () => {
  it("bounds appended pages and preserves absolute row lookup", () => {
    let window: EidosFileRowWindow = { rows: [], startOffset: 0, total: 1_000 }
    for (let offset = 0; offset < 500; offset += 100) {
      window = mergeRowWindowPage(
        window,
        page(offset, 100),
        offset === 0 ? "replace" : "append",
        250
      )
    }

    expect(window.startOffset).toBe(250)
    expect(window.rows).toHaveLength(250)
    expect(rowFromWindow(window, 250)?._id).toBe("row_250")
    expect(rowFromWindow(window, 499)?._id).toBe("row_499")
    expect(rowFromWindow(window, 249)).toBeUndefined()
  })

  it("prepends prior pages and trims the opposite edge", () => {
    const current = mergeRowWindowPage(
      { rows: [], startOffset: 0, total: 1_000 },
      page(400, 100),
      "replace",
      250
    )
    const previous = mergeRowWindowPage(current, page(300, 100), "prepend", 150)

    expect(previous.startOffset).toBe(300)
    expect(previous.rows).toHaveLength(150)
    expect(rowFromWindow(previous, 300)?._id).toBe("row_300")
    expect(rowFromWindow(previous, 449)?._id).toBe("row_449")
  })

  it("requests adjacent pages but replaces the window after a large jump", () => {
    const window = mergeRowWindowPage(
      { rows: [], startOffset: 0, total: 1_000 },
      page(200, 100),
      "replace",
      300
    )

    expect(requestForRowWindow(window, 290, 320, 100)).toEqual({
      mode: "append",
      offset: 300,
    })
    expect(requestForRowWindow(window, 180, 220, 100)).toEqual({
      mode: "prepend",
      offset: 100,
    })
    expect(requestForRowWindow(window, 800, 820, 100)).toEqual({
      mode: "replace",
      offset: 800,
    })
  })

  it("prefetches adjacent pages without redirecting a distant jump", () => {
    const window = mergeRowWindowPage(
      { rows: [], startOffset: 0, total: 1_000 },
      page(200, 100),
      "replace",
      300
    )

    expect(requestForPrefetchedRowWindow(window, 270, 290, 100, 25)).toEqual({
      mode: "append",
      offset: 300,
    })
    expect(requestForPrefetchedRowWindow(window, 210, 230, 100, 25)).toEqual({
      mode: "prepend",
      offset: 100,
    })
    expect(requestForPrefetchedRowWindow(window, 800, 820, 100, 25)).toEqual({
      mode: "replace",
      offset: 800,
    })
  })

  it("clamps a stale total when a requested tail page is empty", () => {
    const current = mergeRowWindowPage(
      { rows: [], startOffset: 0, total: 101 },
      page(0, 100, 101),
      "replace",
      500
    )
    const exhausted = mergeRowWindowPage(
      current,
      { ...page(100, 0, 101), rows: [] },
      "append",
      500
    )

    expect(exhausted.total).toBe(100)
    expect(requestForRowWindow(exhausted, 99, 100, 100)).toBeNull()
  })

  it("advances a contiguous cursor and clears it when paging backward", () => {
    const first = mergeRowWindowPage(
      { rows: [], startOffset: 0, total: 1_000 },
      { ...page(0, 100), nextCursor: "rowid:100" },
      "replace",
      300
    )
    const next = mergeRowWindowPage(
      first,
      { ...page(100, 100), nextCursor: "rowid:200" },
      "append",
      300
    )
    expect(next.nextCursor).toBe("rowid:200")

    const previous = mergeRowWindowPage(
      next,
      { ...page(0, 100), nextCursor: "rowid:100" },
      "prepend",
      300
    )
    expect(previous.nextCursor).toBeUndefined()
  })
})
