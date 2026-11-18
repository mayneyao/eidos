import Database from "better-sqlite3"
import { it } from "vitest"
import { BetterSqlite3ConnectionPort } from "./better-sqlite3"
import { Runtime } from "./runtime-service"
import { expectCalendarWindowConformance } from "./calendar-window.conformance"

it("preserves Notion date membership, root scope, saved View opt-in and atomic features on better-sqlite3", async () => {
  const port = new BetterSqlite3ConnectionPort(new Database(":memory:"))
  let sequence = 0,
    reference = "2026-11-15T01:15:00.000Z"
  const runtime = (
    await Runtime.create(
      port,
      {
        clock: {
          nowInstant: () => reference,
          nowMilliseconds: () => sequence++,
        },
        entropy: {
          randomBytes: (length) =>
            Uint8Array.from({ length }, () => sequence++ & 255),
        },
      },
      { title: "Calendar windows" },
      { cancellation: { cancelled: () => false, onCancel: () => () => {} } }
    )
  ).service
  try {
    await expectCalendarWindowConformance(runtime, (value) => {
      reference = value
    })
  } finally {
    await runtime.close({ requestId: "close" })
    port.close()
  }
})
