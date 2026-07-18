import type { ColumnSchema } from "../types"
import {
  chooseRowidAlias,
  quoteIdentifier,
  stableRelationOrder,
} from "./identifier"

function column(
  name: string,
  primaryKeyOrder = 0,
  hidden: ColumnSchema["hidden"] = 0
): ColumnSchema {
  return {
    cid: 0,
    declaredType: "TEXT",
    defaultValue: null,
    hidden,
    name,
    notNull: false,
    primaryKeyOrder,
  }
}

describe("SQLite identifiers", () => {
  it("quotes embedded double quotes without changing the identifier", () => {
    expect(quoteIdentifier('strange"table; DROP TABLE x')).toBe(
      '"strange""table; DROP TABLE x"'
    )
  })

  it("selects an unshadowed rowid alias for ordinary tables", () => {
    expect(chooseRowidAlias([column("rowid")], "table", false)).toBe("_rowid_")
    expect(
      chooseRowidAlias(
        [column("rowid"), column("_rowid_"), column("oid")],
        "table",
        false
      )
    ).toBeNull()
    expect(chooseRowidAlias([], "table", true)).toBeNull()
    expect(chooseRowidAlias([], "view", false)).toBeNull()
  })

  it("orders WITHOUT ROWID tables by composite primary key", () => {
    expect(
      stableRelationOrder([column("second", 2), column("first", 1)], null)
    ).toEqual({ label: "first, second", sql: '"first", "second"' })
  })
})
