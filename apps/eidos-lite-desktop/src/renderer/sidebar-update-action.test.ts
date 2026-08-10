import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { EidosLiteUpdateStatus } from "../shared/contracts"
import {
  isSidebarUpdateReady,
  SidebarUpdateAction,
} from "./sidebar-update-action"

describe("SidebarUpdateAction", () => {
  it("is ready only after an update finishes downloading", () => {
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

    expect(isSidebarUpdateReady(downloaded)).toBe(true)
    expect(isSidebarUpdateReady(downloading)).toBe(false)
    expect(isSidebarUpdateReady(null)).toBe(false)
  })

  it("renders one clear restart action with the target version", () => {
    const markup = renderToStaticMarkup(
      createElement(SidebarUpdateAction, {
        label: "Restart to update",
        description: "Version 0.2.0 is ready to install.",
        onRestart: () => undefined,
      })
    )

    expect(markup).toContain("data-sidebar-update-ready")
    expect(markup).toContain('type="button"')
    expect(markup).toContain("Restart to update")
    expect(markup).toContain("Version 0.2.0 is ready to install.")
  })
})
