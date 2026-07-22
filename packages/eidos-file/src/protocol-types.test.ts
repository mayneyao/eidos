import { describe, expect, it } from "vitest"

import { MemoryByteSource } from "./protocol-types"

const active = {
  cancellation: {
    cancelled: () => false,
    onCancel: () => () => undefined,
  },
}

describe("Eidos Adapter ByteSource", () => {
  it("returns owned bounded bytes and structured failures", async () => {
    const input = new Uint8Array([1, 2, 3])
    const source = new MemoryByteSource(input)
    input[0] = 9

    const first = await source.read("0", 2, active)
    expect(first).toEqual(new Uint8Array([1, 2]))
    first[0] = 8
    expect(await source.read("0", 3, active)).toEqual(new Uint8Array([1, 2, 3]))

    await expect(source.read("4", 1, active)).rejects.toMatchObject({
      code: "invalid-argument",
      retryable: false,
      fatal: false,
    })
    await expect(
      source.read("0", 1, {
        cancellation: {
          cancelled: () => true,
          onCancel: () => () => undefined,
        },
      })
    ).rejects.toMatchObject({
      code: "cancelled",
      retryable: false,
      fatal: false,
    })

    source.release()
    source.release()
    await expect(source.read("0", 1, active)).rejects.toMatchObject({
      code: "adapter-closed",
      retryable: false,
      fatal: true,
    })
  })
})
