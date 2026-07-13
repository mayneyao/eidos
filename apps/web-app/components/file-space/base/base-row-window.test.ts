import type { BaseRowPage } from "@eidos.space/base"
import { describe, expect, it } from "vitest"

import {
  mergeRowWindowPage,
  requestForRowWindow,
  rowFromWindow,
  type BaseRowWindow,
} from "./base-row-window"

function page(offset: number, count: number, total = 1_000): BaseRowPage {
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

describe("Base row window", () => {
  it("bounds appended pages and preserves absolute row lookup", () => {
    let window: BaseRowWindow = { rows: [], startOffset: 0, total: 1_000 }
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
})
