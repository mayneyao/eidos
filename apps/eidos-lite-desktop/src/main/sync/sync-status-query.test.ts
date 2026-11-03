import { vi } from "vitest"
import type { EidosSyncStatus } from "../../shared/contracts"
import { readSyncStatus } from "./sync-status-query"

function syncStatus(provider: "official" | "custom"): EidosSyncStatus {
  return {
    provider,
    environment: "staging",
    account: { state: "signed-out" },
    device: { state: "not-registered" },
    entitlement: { state: "not-checked", detail: "" },
    remote: { state: "not-connected" },
    canEnable: false,
    canClone: false,
    blocker: null,
  }
}

function previewReader(provider: "official" | "custom") {
  const status = syncStatus(provider)
  const projected = {
    ...status,
    deviceUnlockAvailable: true,
    defaultPasswordConfigured: provider === "official",
  }
  return {
    status: vi.fn(async () => status),
    projectPreview: vi.fn(async () => projected),
    currentConnection: vi.fn(async (): Promise<EidosSyncStatus> => {
      throw new Error("Current Space sync-state must not be read")
    }),
    projected,
  }
}

describe("Sync status queries", () => {
  it("previews official account access without entering the current Space lifecycle", async () => {
    const reader = previewReader("official")

    const result = await readSyncStatus({ provider: "official" }, reader)

    expect(reader.status).toHaveBeenCalledExactlyOnceWith(null)
    expect(reader.projectPreview).toHaveBeenCalledExactlyOnceWith(
      syncStatus("official")
    )
    expect(reader.currentConnection).not.toHaveBeenCalled()
    expect(result).toBe(reader.projected)
  })

  it("previews the selected custom server independently of the current connection", async () => {
    const reader = previewReader("custom")

    const result = await readSyncStatus(
      { provider: "custom", serverId: "server-a" },
      reader
    )

    expect(reader.status).toHaveBeenCalledExactlyOnceWith(null, "server-a")
    expect(reader.projectPreview).toHaveBeenCalledExactlyOnceWith(
      syncStatus("custom")
    )
    expect(reader.currentConnection).not.toHaveBeenCalled()
    expect(result).toBe(reader.projected)
  })

  it.each([undefined, "server-a", "", " server-a "])(
    "preserves legacy current-connection queries for %s",
    async (selection) => {
      const reader = previewReader("official")
      reader.currentConnection.mockResolvedValueOnce(syncStatus("custom"))

      const result = await readSyncStatus(selection, reader)

      expect(reader.currentConnection).toHaveBeenCalledExactlyOnceWith(
        selection
      )
      expect(reader.status).not.toHaveBeenCalled()
      expect(reader.projectPreview).not.toHaveBeenCalled()
      expect(result.provider).toBe("custom")
    }
  )

  it.each([
    {},
    [],
    { provider: "lan" },
    { provider: "official", serverId: "server-a" },
    { provider: "official", remoteUrl: "https://example.com/repository" },
    { provider: "custom" },
    { provider: "custom", serverId: undefined },
    { provider: "custom", serverId: 1 },
    { provider: "custom", serverId: "" },
    { provider: "custom", serverId: "  " },
    { provider: "custom", serverId: "server-a", extra: true },
    Object.assign([], { provider: "official" }),
  ])(
    "rejects malformed previews before any status or connection work: %j",
    async (selection) => {
      const reader = previewReader("official")

      await expect(readSyncStatus(selection, reader)).rejects.toThrow(
        "Invalid Sync status preview"
      )

      expect(reader.status).not.toHaveBeenCalled()
      expect(reader.projectPreview).not.toHaveBeenCalled()
      expect(reader.currentConnection).not.toHaveBeenCalled()
    }
  )

  it.each([null, 1, true])(
    "rejects invalid legacy arguments: %j",
    async (selection) => {
      const reader = previewReader("official")

      await expect(readSyncStatus(selection, reader)).rejects.toThrow(
        "Invalid Custom server"
      )

      expect(reader.status).not.toHaveBeenCalled()
      expect(reader.projectPreview).not.toHaveBeenCalled()
      expect(reader.currentConnection).not.toHaveBeenCalled()
    }
  )

  it("does not fall back to the current Space when a preview fails", async () => {
    const reader = previewReader("custom")
    reader.status.mockRejectedValueOnce(new Error("Server was removed"))

    await expect(
      readSyncStatus({ provider: "custom", serverId: "server-a" }, reader)
    ).rejects.toThrow("Server was removed")

    expect(reader.currentConnection).not.toHaveBeenCalled()
    expect(reader.projectPreview).not.toHaveBeenCalled()
  })
})
