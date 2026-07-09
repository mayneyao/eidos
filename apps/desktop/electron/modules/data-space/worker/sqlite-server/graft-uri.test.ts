import { describe, expect, it } from "vitest"
import { createGraftDbUri } from "./graft-uri"

describe("createGraftDbUri", () => {
  it("uses raw Windows paths so Graft receives the physical path", () => {
    expect(
      createGraftDbUri(
        String.raw`C:\Users\RUNNER~1\AppData\Local\Temp\eidos\.eidos\db.sqlite3`,
        "win32"
      )
    ).toBe(
      String.raw`file:C:\Users\RUNNER~1\AppData\Local\Temp\eidos\.eidos\db.sqlite3?vfs=graft`
    )
  })

  it("keeps pathToFileURL semantics on POSIX platforms", () => {
    expect(createGraftDbUri("/tmp/eidos space/.eidos/db.sqlite3", "darwin")).toBe(
      "file:///tmp/eidos%20space/.eidos/db.sqlite3?vfs=graft"
    )
  })
})
