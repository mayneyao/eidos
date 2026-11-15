import { it } from "vitest"
import { expectCheckboxBinaryConformance } from "./checkbox-binary.conformance"
import { expectCheckboxConversionConformance } from "./checkbox-conversion.conformance"
import { expectCheckboxDefaultConformance } from "./checkbox-default.conformance"
import { createTestWasmConnection } from "./sqlite-wasm-test-helper"

it("converts Checkbox NULL only after an atomic confirmed plan in WASM", async () => {
  const connection = await createTestWasmConnection()
  try {
    await expectCheckboxConversionConformance(connection)
  } finally {
    connection.close()
  }
})

it("creates binary Checkbox fields by default in WASM", async () => {
  const connection = await createTestWasmConnection()
  try {
    await expectCheckboxBinaryConformance(connection)
  } finally {
    connection.close()
  }
})

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
