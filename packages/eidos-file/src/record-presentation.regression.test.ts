import { it } from "vitest"
import { createTestWasmConnection } from "./sqlite-wasm-test-helper"
import { expectRecordPresentationConformance } from "./record-presentation.conformance"

it("round-trips legacy record settings as opaque metadata in browser SQLite", async () => {
  await expectRecordPresentationConformance(await createTestWasmConnection())
})
