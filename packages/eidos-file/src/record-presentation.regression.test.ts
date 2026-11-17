import { it } from "vitest"
import { createTestWasmConnection } from "./sqlite-wasm-test-helper"
import { expectRecordPresentationConformance } from "./record-presentation.conformance"

it("preserves optional record presentation and rejects malformed settings in browser SQLite", async () => {
  await expectRecordPresentationConformance(await createTestWasmConnection())
})
