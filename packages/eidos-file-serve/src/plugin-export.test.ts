// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { downloadPluginFile } from "./plugin-export"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it("downloads from the parent document, returns dispatch status, and releases the blob URL", () => {
  vi.useFakeTimers()
  const create = vi.fn(() => "blob:export")
  const revoke = vi.fn()
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke })
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true)
      expect(this.download).toBe("chart.png")
    })
  expect(
    downloadPluginFile({
      name: "chart.png",
      mimeType: "image/png",
      data: "AAH/",
    })
  ).toEqual({ status: "download-started" })
  expect(click).toHaveBeenCalledOnce()
  expect(document.querySelector("a")).toBeNull()
  expect(revoke).not.toHaveBeenCalled()
  vi.runAllTimers()
  expect(revoke).toHaveBeenCalledWith("blob:export")
})
it("rejects unsafe requests before creating a download", () => {
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {})
  expect(() =>
    downloadPluginFile({
      name: "../x.png",
      mimeType: "image/png",
      data: "AA==",
    })
  ).toThrow()
  expect(click).not.toHaveBeenCalled()
})
