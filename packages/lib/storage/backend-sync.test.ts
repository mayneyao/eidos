// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"

const indexedDbMocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}))

vi.mock("../storage/indexeddb", () => ({
  indexedDBStorage: indexedDbMocks,
}))

import { createBackendSyncStorage } from "./backend-sync"

describe("createBackendSyncStorage", () => {
  beforeEach(() => {
    indexedDbMocks.getItem.mockReset()
    indexedDbMocks.setItem.mockReset()
    indexedDbMocks.removeItem.mockReset()
    indexedDbMocks.getItem.mockResolvedValue(null)
  })

  it("keeps backend revisions separate from the Zustand schema version", async () => {
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        config: {
          get: vi.fn().mockResolvedValue({ version: 12, theme: "light" }),
          set: vi.fn(),
        },
      },
    })
    const storage = createBackendSyncStorage<{
      version?: number
      theme: string
    }>({
      backendConfigKey: "theme",
      getBackendState: (state) => state,
      defaultBackendState: { theme: "system" },
    })

    const persisted = await storage.getItem("theme-storage")

    expect(JSON.parse(persisted ?? "null")).toEqual({
      state: { theme: "light", version: 12 },
      version: 0,
    })
  })
})
