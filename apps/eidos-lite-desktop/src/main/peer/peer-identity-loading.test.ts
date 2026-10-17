import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type * as NodeModule from "node:module"
import { describe, expect, it, vi } from "vitest"

const loads = vi.hoisted(() => ({ certificates: 0 }))
vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal<typeof NodeModule>()
  return {
    ...actual,
    createRequire: (...args: Parameters<typeof NodeModule.createRequire>) =>
      new Proxy(actual.createRequire(...args), {
        apply(target, thisArg, argumentsList) {
          if (argumentsList[0] === "selfsigned") loads.certificates++
          return Reflect.apply(target, thisArg, argumentsList)
        },
      }),
  }
})

describe("LAN certificate loading", () => {
  it("loads the real certificate generator only when LAN sync first needs an identity", async () => {
    const { PeerService } = await import("./peer-service")
    expect(loads.certificates).toBe(0)
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lan-lazy-")
    )
    const gateway = new PeerService(null, directory)
    try {
      expect((await gateway.knownStatus()).running).toBe(false)
      expect(loads.certificates).toBe(0)
      expect((await gateway.start(false)).running).toBe(true)
      expect(loads.certificates).toBe(1)
      const identity = JSON.parse(
        await fs.readFile(
          path.join(directory, "peer-sync/device/identity.json"),
          "utf8"
        )
      ) as { cert: string }
      expect(identity.cert).toContain("BEGIN CERTIFICATE")
    } finally {
      await gateway.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})
