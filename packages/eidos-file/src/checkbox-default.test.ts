import { it } from "vitest"
import { expectCheckboxDefaultConformance } from "./checkbox-default.conformance"
import { createTestWasmConnection } from "./sqlite-wasm-test-helper"

it.each([false, true])(
  "keeps Checkbox defaults and explicit null distinct in WASM (legacy=%s)",
  async (legacy) => {
    const connection = await createTestWasmConnection()
    try {
      await expectCheckboxDefaultConformance(connection, legacy)
    } finally {
      connection.close()
    }
  }
)
