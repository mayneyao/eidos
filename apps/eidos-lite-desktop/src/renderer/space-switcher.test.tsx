// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { SpaceSwitcher } from "./space-switcher"
import type { RecentSpaceEntry } from "../shared/contracts"

vi.mock("./i18n", () => ({
  useEidosLiteI18n: () => ({ t: (value: string) => value }),
}))

it("switches only to available Spaces, escapes the clipped sidebar and returns focus", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const onRecent = vi.fn()
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const recents = [
    { id: "a", name: "Current", path: "/a", available: true },
    { id: "b", name: "Other", path: "/b", available: true },
    { id: "c", name: "Missing", path: "/c", available: false },
  ] as RecentSpaceEntry[]
  try {
    await act(async () =>
      root.render(
        <SpaceSwitcher
          currentId="a"
          name="Current"
          recents={recents}
          onRecent={onRecent}
          onOpen={() => {}}
          onNew={() => {}}
          onClone={() => {}}
        />
      )
    )
    const trigger = host.querySelector("button")!
    await act(async () => trigger.click())
    const menu = document.querySelector(".space-switcher-menu")!
    expect(host.contains(menu)).toBe(false)
    expect(menu.parentElement).toBe(document.body)
    const buttons = Array.from(menu.querySelectorAll("button"))
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[2].disabled).toBe(true)
    await act(async () => buttons[1].click())
    expect(onRecent).toHaveBeenCalledWith("b")
    expect(document.querySelector(".space-switcher-menu")).toBeNull()
    expect(document.activeElement).toBe(trigger)
    await act(async () => trigger.click())
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
    expect(document.querySelector(".space-switcher-menu")).toBeNull()
    expect(onRecent).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it("searches a large recent list by name or path and keeps one entry per folder", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onOpen = vi.fn()
  const recents = Array.from({ length: 100 }, (_, index) => ({
    id: String(index),
    name: `Space ${index}`,
    path: `/projects/${index}`,
    available: true,
  })) as RecentSpaceEntry[]
  recents.push({ ...recents[0]!, id: "current" })
  try {
    await act(async () =>
      root.render(
        <SpaceSwitcher
          currentId="current"
          recents={recents}
          onRecent={vi.fn()}
          onOpen={onOpen}
          onNew={vi.fn()}
          onClone={vi.fn()}
        />
      )
    )
    const trigger = host.querySelector("button")!
    await act(async () => trigger.click())
    const menu = document.querySelector(".space-switcher-menu")!
    const list = menu.querySelector(".space-switcher-recents")!
    const search = menu.querySelector<HTMLInputElement>('input[type="search"]')!
    expect(document.activeElement).toBe(search)
    expect(list.querySelectorAll("button")).toHaveLength(100)
    expect(list.querySelector("button")!.disabled).toBe(true)
    const filter = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(search, value)
        search.dispatchEvent(new Event("input", { bubbles: true }))
      })
    }
    await filter("SPACE 99")
    expect(list.querySelectorAll("button")).toHaveLength(1)
    expect(list.textContent).toContain("Space 99")
    await filter("/projects/42")
    expect(list.querySelectorAll("button")).toHaveLength(1)
    expect(list.textContent).toContain("Space 42")
    await filter("no such folder")
    expect(list.querySelector('[role="status"]')!.textContent).toBe(
      "No matching Spaces"
    )
    const actions = menu.querySelector(".space-switcher-actions")!
    expect(actions.querySelectorAll("button")).toHaveLength(3)
    await act(async () => actions.querySelector("button")!.click())
    expect(onOpen).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(trigger)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
