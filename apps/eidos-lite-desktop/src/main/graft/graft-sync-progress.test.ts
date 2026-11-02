import { describe, expect, it, vi } from "vitest"
import { graftSyncProgressOptions } from "./graft-sync-progress"

describe("SDK sync progress bridge", () => {
  it("keeps request denominators out of cumulative operation progress", () => {
    const report = vi.fn()
    const options = graftSyncProgressOptions(report)
    options.onProgress?.({
      direction: "upload",
      transferredBytes: 100,
      totalBytes: 100,
      totalIsFinal: true,
    })
    options.onSyncProgress?.({ phase: "verifying" })
    options.onSyncProgress?.({
      phase: "verifying",
      requestId: 1,
      transfer: {
        direction: "download",
        transferredBytes: 2,
        totalBytes: 2,
        totalIsFinal: true,
      },
    })
    expect(report).toHaveBeenCalledTimes(2)
    expect(report.mock.calls[1][0]).toEqual({
      direction: "download",
      transferredBytes: 0,
      totalIsFinal: false,
      syncPhase: "verifying",
    })
    options.onProgress?.({
      direction: "download",
      transferredBytes: 5,
      totalBytes: 10,
      totalIsFinal: true,
    })
    expect(report.mock.calls.at(-1)?.[0]).toMatchObject({
      direction: "download",
      transferredBytes: 5,
      totalBytes: 10,
      syncPhase: "verifying",
    })
  })
})
