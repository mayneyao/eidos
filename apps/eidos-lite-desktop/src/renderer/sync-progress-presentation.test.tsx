// @vitest-environment jsdom
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { EidosSyncProgress } from "../shared/contracts"
import { SyncConnectProgress } from "./sync-connect-shared"
import { syncProgressPresentation } from "./sync-progress-presentation"

const progress: EidosSyncProgress = {
  runId: "stage-ui",
  operation: "connect",
  state: "active",
  phase: "push",
  detail: "Uploading",
  startedAtMs: Date.now(),
  phaseStartedAtMs: Date.now(),
  elapsedMs: 200,
  transfer: {
    direction: "download",
    transferredBytes: 1024,
    totalBytes: 1024,
    bytesPerSecond: 512,
    estimatedRemainingMs: 0,
  },
}

it("keeps independent verification visible after the transfer reaches its total", () => {
  const verifying = {
    ...progress,
    phase: "validate",
    nativePhase: "verifying",
    transfer: undefined,
  } as const
  const html = renderToStaticMarkup(
    createElement(SyncConnectProgress, { progress: verifying })
  )
  expect(html).toContain("Checking the cloud copy…")
  expect(html).toContain("Connecting…")
  expect(html).toContain("Server")
  expect(html).not.toContain("Downloaded 1 KiB")
  expect(html).not.toContain("sync-progress-elapsed")
  expect(html).not.toContain("sync-progress-hint")
  expect(html).not.toContain("<progress")
  expect(html).toContain('role="progressbar"')
  expect(html).not.toContain("aria-valuenow")
  expect(syncProgressPresentation(verifying)).toMatchObject({
    percent: null,
    transferring: false,
  })
})

it("shows the verification download's own trusted progress", () => {
  const verifying = {
    ...progress,
    phase: "validate",
    nativePhase: "verifying",
    transfer: { ...progress.transfer!, transferredBytes: 512 },
  } as const
  const html = renderToStaticMarkup(
    createElement(SyncConnectProgress, { progress: verifying })
  )
  expect(html).toContain('<progress aria-label="Transfer progress"')
  expect(html).toContain("50%")
  expect(html).toContain("Checking the cloud copy…")
})

it("shows only known transfer percentages and suppresses stale estimates during local application", () => {
  expect(
    syncProgressPresentation({ ...progress, nativePhase: "downloading" })
      .percent
  ).toBe(100)
  expect(
    syncProgressPresentation({
      ...progress,
      transfer: { ...progress.transfer!, totalBytes: null },
    }).percent
  ).toBeNull()
  expect(
    syncProgressPresentation({ ...progress, nativePhase: "applying" })
  ).toMatchObject({ transferring: false, percent: null })
})

it("stops the activity indicator at completion and failure", () => {
  for (const state of ["completed", "failed"] as const) {
    const html = renderToStaticMarkup(
      createElement(SyncConnectProgress, {
        progress: { ...progress, state, nativePhase: "verifying" },
      })
    )
    expect(html).not.toContain('class="spin"')
    expect(html).not.toContain("<progress")
    expect(html).toContain(
      state === "completed" ? "Sync complete" : "Sync interrupted"
    )
  }
})

it("does not render a percentage for invalid counters", () => {
  expect(
    syncProgressPresentation({
      ...progress,
      transfer: { ...progress.transfer!, transferredBytes: Number.NaN },
    }).percent
  ).toBeNull()
  expect(
    syncProgressPresentation({
      ...progress,
      transfer: { ...progress.transfer!, transferredBytes: 1025 },
    }).percent
  ).toBeNull()
})

it("shows an indeterminate track until the upload total is known", () => {
  const html = renderToStaticMarkup(
    createElement(SyncConnectProgress, {
      progress: {
        ...progress,
        nativePhase: "uploading",
        transfer: {
          ...progress.transfer!,
          direction: "upload",
          totalBytes: null,
        },
      },
    })
  )
  expect(html).toContain('role="progressbar"')
  expect(html).not.toContain("aria-valuenow")
  expect(html).toContain("1 KiB sent")
})

it("renders a determinate track for a trusted upload total", () => {
  const html = renderToStaticMarkup(
    createElement(SyncConnectProgress, {
      progress: {
        ...progress,
        nativePhase: "uploading",
        transfer: {
          ...progress.transfer!,
          direction: "upload",
          transferredBytes: 512,
          totalBytes: 1024,
        },
      },
    })
  )
  expect(html).toContain('<progress aria-label="Transfer progress"')
  expect(html).toContain('value="512"')
  expect(html).toContain("50%")
})

it("shows zero at the start and never rounds an incomplete transfer to 100%", () => {
  const base = {
    ...progress,
    nativePhase: "downloading" as const,
    transfer: { ...progress.transfer!, transferredBytes: 0 },
  }
  const html = renderToStaticMarkup(
    createElement(SyncConnectProgress, { progress: base })
  )
  expect(html).toContain("0%")
  expect(
    syncProgressPresentation({
      ...base,
      transfer: { ...base.transfer, transferredBytes: 1023 },
    }).percent
  ).toBe(99)
})
