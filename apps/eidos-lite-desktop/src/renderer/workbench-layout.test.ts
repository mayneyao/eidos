import { describe, expect, it } from "vitest"

import { resolveWorkbenchSurfaces } from "./workbench-layout"

describe("resolveWorkbenchSurfaces", () => {
  it("splits file content and Terminal vertically by default", () => {
    expect(
      resolveWorkbenchSurfaces({
        terminalLayout: "bottom",
        terminalVisible: true,
        auxiliaryView: null,
        diffOpen: false,
        mergeOpen: false,
      })
    ).toEqual({ content: "file", right: null, terminal: "bottom" })
  })

  it("keeps the bottom Terminal independent from History and Sync", () => {
    const base = {
      terminalLayout: "bottom" as const,
      terminalVisible: true,
      diffOpen: false,
      mergeOpen: false,
    }

    expect(resolveWorkbenchSurfaces({ ...base, auxiliaryView: null })).toEqual({
      content: "file",
      right: null,
      terminal: "bottom",
    })
    expect(
      resolveWorkbenchSurfaces({ ...base, auxiliaryView: "history" })
    ).toEqual({ content: "file", right: "history", terminal: "bottom" })
    expect(
      resolveWorkbenchSurfaces({ ...base, auxiliaryView: "sync" })
    ).toEqual({ content: "file", right: "sync", terminal: "bottom" })
  })

  it("splits Terminal and file content side by side without using the right sidebar", () => {
    expect(
      resolveWorkbenchSurfaces({
        terminalLayout: "side",
        terminalVisible: true,
        auxiliaryView: "sync",
        diffOpen: false,
        mergeOpen: false,
      })
    ).toEqual({ content: "file", right: "sync", terminal: "side" })
  })

  it("lets file content fill the middle work area when Terminal is closed", () => {
    expect(
      resolveWorkbenchSurfaces({
        terminalLayout: "side",
        terminalVisible: false,
        auxiliaryView: "sync",
        diffOpen: false,
        mergeOpen: false,
      })
    ).toEqual({ content: "file", right: "sync", terminal: null })
  })

  it("gives an active merge the main surface and Changes sidebar", () => {
    expect(
      resolveWorkbenchSurfaces({
        terminalLayout: "bottom",
        terminalVisible: true,
        auxiliaryView: "history",
        diffOpen: true,
        mergeOpen: true,
      })
    ).toEqual({ content: "merge", right: "history", terminal: "bottom" })
  })

  it("routes a selected diff into the main surface while keeping Versions on the right", () => {
    expect(
      resolveWorkbenchSurfaces({
        terminalLayout: "bottom",
        terminalVisible: true,
        auxiliaryView: "history",
        diffOpen: true,
        mergeOpen: false,
      })
    ).toEqual({ content: "diff", right: "history", terminal: "bottom" })
  })
})
