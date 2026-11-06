// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { vi } from "vitest"

import type { EidosLiteUpdateStatus } from "../shared/contracts"
import {
  isSidebarUpdateVisible,
  SidebarUpdateAction,
} from "./sidebar-update-action"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const baseStatus = { currentVersion: "0.1.0", version: "0.2.0" }

describe("SidebarUpdateAction", () => {
  it.each<EidosLiteUpdateStatus["state"]>([
    "idle",
    "unavailable",
    "checking",
    "up-to-date",
    "available",
    "downloading",
    "downloaded",
    "error",
  ])("only exposes an update action in an actionable state: %s", (state) => {
    expect(isSidebarUpdateVisible({ ...baseStatus, state })).toBe(
      ["available", "downloading", "downloaded"].includes(state)
    )
    expect(isSidebarUpdateVisible(null)).toBe(false)
  })

  it.each([
    [0, 0],
    [42, 42],
    [72.6, 73],
    [100, 100],
    [-20, 0],
    [145, 100],
    [undefined, undefined],
    [NaN, undefined],
    [Infinity, undefined],
    [-Infinity, undefined],
  ])("renders truthful download progress for %s", (raw, percent) => {
    const status: EidosLiteUpdateStatus & { state: "downloading" } = {
      ...baseStatus,
      state: "downloading",
      progressPercent: raw,
    }
    const host = document.createElement("div")
    host.innerHTML = renderToStaticMarkup(
      createElement(SidebarUpdateAction, {
        status,
        onDownload: vi.fn(),
        onRestart: vi.fn(),
      })
    )
    const progress = host.querySelector('[role="progressbar"]')!
    const fill = host.querySelector<HTMLElement>(
      ".sidebar-update-progress-fill"
    )
    expect(progress.getAttribute("aria-valuenow")).toBe(
      percent === undefined ? null : String(percent)
    )
    expect(progress.getAttribute("aria-valuemin")).toBe("0")
    expect(progress.getAttribute("aria-valuemax")).toBe("100")
    expect(progress.textContent).toBe(
      percent === undefined ? "Downloading…" : `Downloading ${percent}%`
    )
    expect(progress.getAttribute("title")).toBe(
      percent === undefined
        ? "Downloading update…"
        : `Downloading update… ${percent}%`
    )
    if (percent !== undefined && percent > 0) {
      expect(fill?.style.width).toBe(`${percent}%`)
      expect(fill?.getAttribute("aria-hidden")).toBe("true")
    } else {
      // No false fill or leading progress edge at zero or an unknown total.
      expect(fill).toBeNull()
    }
    expect(host.querySelector("button")).toBeNull()
    expect(host.querySelector(".sidebar-update-content svg")).not.toBeNull()
  })

  it("preserves action boundaries across download, readiness, and error transitions", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const onDownload = vi.fn()
    const onRestart = vi.fn()
    const render = (
      state: EidosLiteUpdateStatus["state"],
      progressPercent?: number
    ) => {
      const status = { ...baseStatus, state, progressPercent }
      root.render(
        isSidebarUpdateVisible(status)
          ? createElement(SidebarUpdateAction, {
              status,
              onDownload,
              onRestart,
            })
          : null
      )
    }
    try {
      await act(async () => render("available", 72))
      let button = host.querySelector("button")!
      expect(button.textContent).toBe("Download update")
      expect(button.title).toBe("Update 0.2.0 is available.")
      expect(button.disabled).toBe(false)
      expect(host.querySelector(".sidebar-update-progress-fill")).toBeNull()
      button.focus()
      expect(document.activeElement).toBe(button)
      await act(async () => button.click())
      expect(onDownload).toHaveBeenCalledOnce()
      expect(onRestart).not.toHaveBeenCalled()

      await act(async () => render("downloading", 42))
      const progress = host.querySelector<HTMLElement>('[role="progressbar"]')!
      await act(async () => progress.click())
      expect(host.querySelector("button")).toBeNull()
      expect(progress.tabIndex).toBe(-1)
      expect(onDownload).toHaveBeenCalledOnce()
      expect(onRestart).not.toHaveBeenCalled()

      await act(async () => render("downloading"))
      expect(host.textContent).toBe("Downloading…")
      expect(host.querySelector(".sidebar-update-progress-fill")).toBeNull()
      expect(progress.hasAttribute("aria-valuenow")).toBe(false)

      await act(async () => render("downloading", 100))
      expect(host.querySelector("button")).toBeNull()
      expect(host.textContent).toBe("Downloading 100%")

      await act(async () => render("downloaded", 100))
      button = host.querySelector("button")!
      expect(button.textContent).toBe("Restart to update")
      expect(button.getAttribute("aria-label")).toBe(
        "Restart to update. Version 0.2.0 is ready to install."
      )
      expect(host.querySelector('[role="progressbar"]')).toBeNull()
      expect(host.querySelector(".sidebar-update-progress-fill")).toBeNull()
      await act(async () => button.click())
      expect(onRestart).toHaveBeenCalledOnce()

      await act(async () => render("error", 100))
      expect(host.textContent).toBe("")
      await act(async () => render("checking"))
      expect(host.textContent).toBe("")
      await act(async () => render("available"))
      expect(host.textContent).toBe("Download update")
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
