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

it("previews animated ordering before drop, restores cancelled drags, and highlights the whole active row", async () => {
  localStorage.clear()
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const pages = ["A", "B", "C", "D"].map((key) => ({ key, title: key }))
  const animateDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "animate"
  )
  const animate = vi.fn(() => ({ cancel: vi.fn() }))
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  })
  let reducedMotion = false
  vi.stubGlobal("matchMedia", () => ({ matches: reducedMotion }))
  const rect = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      const index = this.classList.contains("sidebar-pages-choice")
        ? [...this.parentElement!.children].indexOf(this)
        : 0
      return new DOMRect(0, index * 32, 200, 32)
    })
  const send = async (selector: string, type: string, clientY = 0) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientY,
    })
    Object.defineProperty(event, "dataTransfer", {
      value: { setData: vi.fn() },
    })
    await act(async () => {
      host.querySelector(selector)!.dispatchEvent(event)
    })
  }
  const order = () =>
    [...host.querySelectorAll(".sidebar-page-open")].map(
      (row) => row.textContent
    )
  try {
    await act(async () =>
      root.render(
        <SidebarPages
          spaceId="preview"
          pages={pages}
          activePage="D"
          onPage={vi.fn()}
        />
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Pages"]')!.click()
    )
    const active = host.querySelectorAll(".sidebar-pages-choice[data-current]")
    expect(active).toHaveLength(1)
    expect(active[0]!.querySelector(".sidebar-page-open")?.textContent).toBe(
      "D"
    )
    await send('[aria-label="Reorder page: D"]', "dragstart")
    await send(".sidebar-pages-choice", "dragover", 1)
    expect(order()).toEqual(["D", "A", "B", "C"])
    expect(localStorage.getItem("eidos-lite:page-order:preview")).toBeNull()
    expect(animate).toHaveBeenCalled()
    expect(animate.mock.calls[0]).toHaveLength(2)
    await send('[aria-label="Reorder page: D"]', "dragend")
    expect(order()).toEqual(["A", "B", "C", "D"])
    expect(localStorage.getItem("eidos-lite:page-order:preview")).toBeNull()
    reducedMotion = true
    animate.mockClear()
    await send('[aria-label="Reorder page: D"]', "dragstart")
    await send(".sidebar-pages-choice", "dragover", 1)
    expect(order()).toEqual(["D", "A", "B", "C"])
    expect(animate).not.toHaveBeenCalled()
    await send(".sidebar-pages-choice", "drop")
    expect(
      JSON.parse(localStorage.getItem("eidos-lite:page-order:preview")!)
    ).toEqual(["D", "A", "B", "C"])
    await act(async () =>
      root.render(
        <SidebarPages
          spaceId="preview"
          pages={pages}
          activePage={null}
          onPage={vi.fn()}
        />
      )
    )
    expect(host.querySelector(".sidebar-pages-choice[data-current]")).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    rect.mockRestore()
    if (animateDescriptor)
      Object.defineProperty(HTMLElement.prototype, "animate", animateDescriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, "animate")
    vi.unstubAllGlobals()
    localStorage.clear()
  }
})
