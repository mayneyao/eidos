import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { SpaceVersionTableDiff } from "../shared/contracts"
import { TableDiff, versionRowDiffPage } from "./version-panel"

describe("VersionPanel row diff paging", () => {
  it("keeps a 10k-row diff bounded while retaining every page", () => {
    const changes = Array.from({ length: 10_126 }, (_, index) => index)

    expect(versionRowDiffPage(changes, 0)).toMatchObject({
      page: 0,
      pageCount: 102,
      start: 0,
      end: 100,
      total: 10_126,
      items: Array.from({ length: 100 }, (_, index) => index),
    })
    expect(versionRowDiffPage(changes, 101)).toMatchObject({
      page: 101,
      pageCount: 102,
      start: 10_100,
      end: 10_126,
      total: 10_126,
      items: Array.from({ length: 26 }, (_, index) => 10_100 + index),
    })
    expect(versionRowDiffPage(changes, 999)).toMatchObject({
      page: 101,
      start: 10_100,
      end: 10_126,
    })
  })

  it("mounts only the first bounded page for a 10k-row table diff", () => {
    const table: SpaceVersionTableDiff = {
      name: "Elden Ring messages",
      columns: ["msg"],
      primaryKeyColumns: ["_id"],
      changes: Array.from({ length: 10_126 }, (_, index) => ({
        op: "insert",
        key: { _id: String(index + 1) },
        values: [`Message ${index + 1}`],
      })),
    }

    const markup = renderToStaticMarkup(createElement(TableDiff, { table }))

    expect(markup.match(/class="row-diff"/g)).toHaveLength(100)
    expect(markup).toContain("1–100 of 10,126")
    expect(markup).toContain('aria-label="Next row changes"')
  })
})
