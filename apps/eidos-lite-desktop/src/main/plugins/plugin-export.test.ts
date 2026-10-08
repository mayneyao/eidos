import fs from "node:fs/promises"
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  destroyed: vi.fn(() => false),
}))
vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [
      { webContents: { id: 1 }, isDestroyed: mocks.destroyed },
    ],
  },
  dialog: { showSaveDialog: mocks.save },
}))
import { exportPluginFile } from "./plugin-export"
const input = {
  name: "chart.png",
  mimeType: "image/png",
  data: new Uint8Array([0, 1, 255]),
}
beforeEach(() => {
  vi.restoreAllMocks()
  mocks.save.mockReset()
  mocks.destroyed.mockReturnValue(false)
})
it("writes only to the user-selected destination after checking the active grant", async () => {
  mocks.save.mockResolvedValue({
    canceled: false,
    filePath: "/selected/chart.png",
  })
  const write = vi.spyOn(fs, "writeFile").mockResolvedValue()
  const authorize = vi.fn(async () => {})
  expect(await exportPluginFile(1, input, authorize)).toEqual({
    status: "saved",
  })
  expect(authorize).toHaveBeenCalledOnce()
  expect(write).toHaveBeenCalledWith("/selected/chart.png", input.data)
})
it("cancellation does not write", async () => {
  mocks.save.mockResolvedValue({ canceled: true })
  const write = vi.spyOn(fs, "writeFile").mockResolvedValue()
  expect(await exportPluginFile(1, input, vi.fn())).toEqual({
    status: "cancelled",
  })
  expect(write).not.toHaveBeenCalled()
})
it("rejects revoked grants and closed windows after the dialog, and propagates write failures", async () => {
  mocks.save.mockResolvedValue({
    canceled: false,
    filePath: "/selected/chart.png",
  })
  const write = vi.spyOn(fs, "writeFile").mockResolvedValue()
  await expect(
    exportPluginFile(1, input, async () => {
      throw new Error("Grant revoked")
    })
  ).rejects.toThrow("Grant revoked")
  expect(write).not.toHaveBeenCalled()
  mocks.destroyed.mockReturnValueOnce(false).mockReturnValueOnce(true)
  await expect(exportPluginFile(1, input, async () => {})).rejects.toThrow(
    "window closed"
  )
  expect(write).not.toHaveBeenCalled()
  mocks.destroyed.mockReturnValue(false)
  write.mockRejectedValue(new Error("Disk full"))
  await expect(exportPluginFile(1, input, async () => {})).rejects.toThrow(
    "Disk full"
  )
})
