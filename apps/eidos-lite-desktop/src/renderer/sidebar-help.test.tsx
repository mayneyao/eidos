// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { SidebarHelp } from "./sidebar-help"
import type { EidosLiteUpdateStatus } from "../shared/contracts"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it("opens help actions, supports keyboard navigation, and restores focus", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onFeedback = vi.fn()
  const onReleaseNotes = vi.fn()
  const onCheckForUpdates = vi.fn()
  try {
    await act(async () => {
      root.render(
        <SidebarHelp
          onFeedback={onFeedback}
          onReleaseNotes={onReleaseNotes}
          onCheckForUpdates={onCheckForUpdates}
        />
      )
    })
    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-sidebar-action="help"]'
    )!
    const press = async (key: string) =>
      act(async () => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true })
        )
      })
    await act(async () => trigger.click())
    let items = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    expect(items).toHaveLength(3)
    expect(document.activeElement).toBe(items[0])
    await press("ArrowUp")
    expect(document.activeElement).toBe(items[2])
    await press("Escape")
    expect(host.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    await press("ArrowDown")
    items = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    await act(async () => items[0]!.click())
    expect(onFeedback).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(trigger)
    await act(async () => trigger.click())
    items = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    await act(async () => items[1]!.click())
    expect(onReleaseNotes).toHaveBeenCalledOnce()
    await act(async () => trigger.click())
    items = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    expect(items[2]?.textContent).toBe("Check for updates")
    await act(async () => items[2]!.click())
    expect(onCheckForUpdates).toHaveBeenCalledOnce()
    expect(host.querySelector('[role="menu"]')).not.toBeNull()
    await press("Escape")
    expect(document.activeElement).toBe(trigger)
    await act(async () => trigger.click())
    await act(async () =>
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    )
    expect(host.querySelector('[role="menu"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it("checks in place, prevents duplicate checks, and shows the result without moving focus", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  let finish: (() => void) | undefined
  let status: EidosLiteUpdateStatus | null = null
  const onCheckForUpdates = vi.fn(
    () => new Promise<void>((resolve) => (finish = resolve))
  )
  const render = () =>
    root.render(
      <SidebarHelp
        onFeedback={vi.fn()}
        onReleaseNotes={vi.fn()}
        onCheckForUpdates={onCheckForUpdates}
        updateStatus={status}
      />
    )
  try {
    await act(async () => render())
    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-sidebar-action="help"]'
    )!
    await act(async () => trigger.click())
    const check =
      host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[2]!
    check.focus()
    await act(async () => {
      check.click()
      check.click()
    })
    expect(onCheckForUpdates).toHaveBeenCalledOnce()
    expect(check.getAttribute("aria-disabled")).toBe("true")
    expect(check.textContent).toBe("Checking for updates…")
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Checking for updates…"
    )
    expect(document.activeElement).toBe(check)
    await act(async () => {
      status = { state: "up-to-date", currentVersion: "0.26.0" }
      render()
      finish?.()
    })
    expect(host.querySelector('[role="menu"]')).not.toBeNull()
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "You're up to date."
    )
    expect(check.getAttribute("aria-disabled")).toBeNull()
    expect(document.activeElement).toBe(check)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it.each([
  [
    { state: "available", currentVersion: "0.26.0", version: "0.27.0" },
    "Update 0.27.0 is available.",
  ],
  [
    {
      state: "unavailable",
      currentVersion: "0.26.0",
      unavailableReason: "development",
    },
    "Updates are available only in a packaged production build.",
  ],
  [
    { state: "error", currentVersion: "0.26.0" },
    "Could not check for updates. Try again later.",
  ],
] satisfies [EidosLiteUpdateStatus, string][])(
  "shows a %s check result in the help menu",
  async (status, message) => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const onCheckForUpdates = vi.fn(async () => {})
    try {
      await act(async () => {
        root.render(
          <SidebarHelp
            onFeedback={vi.fn()}
            onReleaseNotes={vi.fn()}
            onCheckForUpdates={onCheckForUpdates}
            updateStatus={status}
          />
        )
      })
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>('[data-sidebar-action="help"]')
          ?.click()
      )
      expect(host.querySelector('[role="status"], [role="alert"]')).toBeNull()
      await act(async () =>
        host
          .querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[2]
          ?.click()
      )
      expect(onCheckForUpdates).toHaveBeenCalledOnce()
      expect(
        host.querySelector('[role="status"], [role="alert"]')?.textContent
      ).toBe(message)
      expect(host.querySelector('[role="menu"]')).not.toBeNull()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  }
)

it("keeps a failed check in place and lets the user retry", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onCheckForUpdates = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(undefined)
  try {
    await act(async () => {
      root.render(
        <SidebarHelp
          onFeedback={vi.fn()}
          onReleaseNotes={vi.fn()}
          onCheckForUpdates={onCheckForUpdates}
        />
      )
    })
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-sidebar-action="help"]')
        ?.click()
    )
    const check =
      host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[2]!
    await act(async () => check.click())
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Offline")
    expect(host.querySelector('[role="menu"]')).not.toBeNull()
    expect(check.getAttribute("aria-disabled")).toBeNull()
    await act(async () => check.click())
    expect(onCheckForUpdates).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
