import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { EidosLiteUpdateStatus } from "../shared/contracts"
import {
  isSidebarUpdateVisible,
  SidebarUpdateAction,
} from "./sidebar-update-action"

describe("SidebarUpdateAction", () => {
  it("is visible when an update is available, downloading, or ready", () => {
    const available: EidosLiteUpdateStatus = {
      state: "available",
      currentVersion: "0.1.0",
      version: "0.2.0",
    }
    const downloaded: EidosLiteUpdateStatus = {
      state: "downloaded",
      currentVersion: "0.1.0",
      version: "0.2.0",
      progressPercent: 100,
    }
    const downloading: EidosLiteUpdateStatus = {
      state: "downloading",
      currentVersion: "0.1.0",
      version: "0.2.0",
      progressPercent: 72,
    }

    expect(isSidebarUpdateVisible(available)).toBe(true)
    expect(isSidebarUpdateVisible(downloaded)).toBe(true)
    expect(isSidebarUpdateVisible(downloading)).toBe(true)
    expect(isSidebarUpdateVisible(null)).toBe(false)
  })

  it("renders download progress as a compact live status", () => {
    const status: EidosLiteUpdateStatus & { state: "downloading" } = {
      state: "downloading",
      currentVersion: "0.1.0",
      version: "0.2.0",
      progressPercent: 72,
    }
    const markup = renderToStaticMarkup(
      createElement(SidebarUpdateAction, {
        status,
        label: "Downloading 72%",
        description: "Downloading update… 72%",
        onDownload: () => undefined,
        onRestart: () => undefined,
      })
    )

    expect(markup).toContain('data-sidebar-update-state="downloading"')
    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain('aria-valuenow="72"')
    expect(markup).toContain("Downloading 72%")
    expect(markup).not.toContain("<button")
  })

  it("turns into one clear restart action when the update is ready", () => {
    const status: EidosLiteUpdateStatus & { state: "downloaded" } = {
      state: "downloaded",
      currentVersion: "0.1.0",
      version: "0.2.0",
      progressPercent: 100,
    }
    const markup = renderToStaticMarkup(
      createElement(SidebarUpdateAction, {
        status,
        label: "Restart to update",
        description: "Version 0.2.0 is ready to install.",
        onDownload: () => undefined,
        onRestart: () => undefined,
      })
    )

    expect(markup).toContain('data-sidebar-update-state="downloaded"')
    expect(markup).toContain('type="button"')
    expect(markup).toContain("Restart to update")
    expect(markup).toContain(
      'aria-label="Restart to update. Version 0.2.0 is ready to install."'
    )
  })
})
