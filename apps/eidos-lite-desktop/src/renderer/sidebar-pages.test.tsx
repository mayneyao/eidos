// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { SidebarPages } from "./sidebar-pages"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it("shows three pages, persists pins and ordering, and cancels keyboard reordering", async () => {
  localStorage.clear()
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onPage = vi.fn()
  const pages = ["Journals", "Notes", "Tasks", "Calendar"].map((title) => ({
    key: title,
    title,
  }))
  const render = (count = 4, spaceId = "test") => (
    <SidebarPages
      key={spaceId}
      spaceId={spaceId}
      pages={pages.slice(0, count)}
      activePage="Journals"
      onPage={onPage}
    />
  )
  const click = async (label: string) =>
    act(async () => {
      host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click()
    })
  const keys = () =>
    Array.from(host.querySelectorAll(".sidebar-page-button")).map((button) =>
      button.getAttribute("aria-label")
    )
  const press = async (key: string) =>
    act(async () => {
      host
        .querySelector('[aria-label="Reorder page: Calendar"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
        )
    })
  try {
    await act(async () => root.render(render(3)))
    expect(keys()).toEqual(["Journals", "Notes", "Tasks"])
    expect(host.querySelector('[aria-label="Pages"]')).toBeNull()
    await act(async () => root.render(render()))
    await click("Pages")
    await click("Pin page: Calendar")
    expect(keys()).toEqual(["Journals", "Notes", "Calendar"])
    await press(" ")
    await press("ArrowUp")
    await press("ArrowUp")
    await press("ArrowUp")
    await press(" ")
    expect(keys()).toEqual(["Calendar", "Journals", "Notes"])
    await press(" ")
    await press("ArrowDown")
    await press("Escape")
    expect(keys()).toEqual(["Calendar", "Journals", "Notes"])
    await act(async () => root.render(null))
    await act(async () => root.render(render()))
    expect(keys()).toEqual(["Calendar", "Journals", "Notes"])
    await click("Calendar")
    expect(onPage).toHaveBeenCalledWith("Calendar")
    await click("Pages")
    await click("Unpin page: Calendar")
    expect(keys()).toEqual(["Calendar", "Journals", "Notes"])
    await act(async () => root.render(render(4, "another")))
    expect(keys()).toEqual(["Journals", "Notes", "Tasks"])
  } finally {
    await act(async () => root.unmount())
    host.remove()
    localStorage.clear()
  }
})

it("reorders pages through the drag handle", async () => {
  const host = document.createElement("div")
  const root = createRoot(host)
  const pages = ["A", "B", "C", "D"].map((key) => ({ key, title: key }))
  try {
    await act(async () =>
      root.render(
        <SidebarPages spaceId="drag" pages={pages} onPage={vi.fn()} />
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Pages"]')!.click()
    )
    const event = new Event("dragstart", { bubbles: true })
    Object.defineProperty(event, "dataTransfer", {
      value: { setData: vi.fn() },
    })
    await act(async () =>
      host.querySelector('[aria-label="Reorder page: D"]')!.dispatchEvent(event)
    )
    await act(async () =>
      host
        .querySelector(".sidebar-pages-choice")!
        .dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }))
    )
    expect(
      JSON.parse(localStorage.getItem("eidos-lite:page-order:drag")!)
    ).toEqual(["D", "A", "B", "C"])
  } finally {
    await act(async () => root.unmount())
    localStorage.clear()
  }
})
