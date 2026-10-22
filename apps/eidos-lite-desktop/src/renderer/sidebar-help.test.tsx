// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { SidebarHelp } from "./sidebar-help"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it("opens both help actions, supports keyboard navigation, and restores focus", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onFeedback = vi.fn()
  const onReleaseNotes = vi.fn()
  try {
    await act(async () => {
      root.render(
        <SidebarHelp onFeedback={onFeedback} onReleaseNotes={onReleaseNotes} />
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
    expect(items).toHaveLength(2)
    expect(document.activeElement).toBe(items[0])
    await press("ArrowUp")
    expect(document.activeElement).toBe(items[1])
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
    await act(async () =>
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    )
    expect(host.querySelector('[role="menu"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
