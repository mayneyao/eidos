import { describe, expect, it } from "vitest"

import { eidosFileRecordNeighbors } from "./eidos-file-record-navigation"

const rows = [{ _id: "one" }, { _id: "two" }, { _id: "three" }]

describe("eidosFileRecordNeighbors", () => {
  it("returns the records surrounding the current row", () => {
    expect(eidosFileRecordNeighbors(rows, rows[1])).toEqual({
      previous: rows[0],
      next: rows[2],
    })
  })

  it("keeps navigation inside the available record sequence", () => {
    expect(eidosFileRecordNeighbors(rows, rows[0])).toEqual({
      previous: null,
      next: rows[1],
    })
    expect(eidosFileRecordNeighbors(rows, rows[2])).toEqual({
      previous: rows[1],
      next: null,
    })
  })
})
