// @vitest-environment node
import { it } from "vitest"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { verifyLookupRelation } from "./lookup-relation.test-helper"

it("Issue 188: WASM Lookup of Relation preserves IDs, labels, targets and aggregate values", async () => {
  await verifyLookupRelation(await createTestWasmConnection())
})
