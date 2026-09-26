import { DatabaseSync } from "node:sqlite"
import { expect, it } from "vitest"
import { assertPortableFsMeta } from "./vtab-resolver"

it("requires the portable root capability instead of trusting a binary filename", () => {
  const database = new DatabaseSync(":memory:")
  try {
    expect(() => assertPortableFsMeta(database)).toThrow("too old")
    database.function("fs_meta_root_mode", () => "cwd")
    expect(() => assertPortableFsMeta(database)).toThrow("too old")
    database.function("fs_meta_root_mode", () => "database")
    expect(() => assertPortableFsMeta(database)).not.toThrow()
  } finally {
    database.close()
  }
})
