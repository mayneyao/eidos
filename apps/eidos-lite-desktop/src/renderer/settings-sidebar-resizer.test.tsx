// @vitest-environment jsdom
import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  SettingsSidebarResizer,
  SETTINGS_SIDEBAR_WIDTH_KEY,
} from "./settings-sidebar-resizer"
import { SettingsSearch } from "./settings-search"
import { SETTINGS } from "./settings-catalog"

describe("Settings sidebar resizing", () => {
  let host: HTMLDivElement
  let root: Root
  let layoutWidth: number
  const inputRef = createRef<HTMLInputElement>()
  const navigate = vi.fn()
  const captured = new Set<number>()
  let release: ReturnType<typeof vi.fn>
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    window.localStorage.clear()
    captured.clear()
    navigate.mockReset()
    layoutWidth = 1000
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })
  const layout = () => host.querySelector<HTMLElement>(".settings-layout")!
  const surface = () => host.querySelector<HTMLElement>(".settings-shell")!
  const separator = () => host.querySelector<HTMLElement>('[role="separator"]')!
  const width = () => Number(separator().getAttribute("aria-valuenow"))
  const mount = async () => {
    await act(async () =>
      root.render(
        <div className="settings-shell">
          <div className="settings-layout">
            <aside id="settings-sidebar">
              <SettingsSearch
                descriptors={[SETTINGS.appearance, SETTINGS.markdownEditor]}
                inputRef={inputRef}
                navigationVersion={0}
                catalogState="ready"
                onRetry={() => {}}
                onNavigate={navigate}
              />
              <nav>
                <button type="button">Preferences</button>
              </nav>
              <SettingsSidebarResizer />
            </aside>
            <div className="settings-content">
              <input data-draft defaultValue="unsaved setting draft" />
            </div>
          </div>
        </div>
      )
    )
    Object.defineProperty(layout(), "clientWidth", {
      configurable: true,
      get: () => layoutWidth,
    })
    Object.defineProperty(surface(), "clientWidth", {
      configurable: true,
      get: () => layoutWidth,
    })
    release = vi.fn((id: number) => {
      captured.delete(id)
    })
    Object.defineProperties(separator(), {
      setPointerCapture: {
        configurable: true,
        value: vi.fn((id: number) => {
          captured.add(id)
        }),
      },
      hasPointerCapture: {
        configurable: true,
        value: (id: number) => captured.has(id),
      },
      releasePointerCapture: { configurable: true, value: release },
    })
    await act(async () => window.dispatchEvent(new Event("resize")))
  }
  const pointer = (
    type: string,
    clientX: number,
    pointerId = 1,
    button = 0
  ) => {
    const event = new MouseEvent(type, {
      clientX,
      button,
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      isPrimary: { value: true },
    })
    return act(async () => separator().dispatchEvent(event))
  }
  const key = async (
    name: string,
    options: KeyboardEventInit = {},
    target = separator()
  ) => {
    const event = new KeyboardEvent("keydown", {
      key: name,
      bubbles: true,
      cancelable: true,
      ...options,
    })
    await act(async () => target.dispatchEvent(event))
    return event
  }
  const query = async () => {
    const input = inputRef.current!
    await act(async () => input.focus())
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, "theme")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    return input
  }

  it("drags within the available window and remembers the completed width without remounting drafts or search", async () => {
    layoutWidth = 680
    await mount()
    expect(width()).toBe(200)
    expect(separator().getAttribute("aria-valuemax")).toBe("360")
    const input = await query()
    const draft = host.querySelector<HTMLInputElement>("[data-draft]")!
    await pointer("pointerdown", 200)
    await pointer("pointermove", 550)
    expect(width()).toBe(360)
    expect(surface().style.getPropertyValue("--settings-sidebar-width")).toBe(
      "360px"
    )
    expect(window.localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY)).toBeNull()
    await pointer("pointerup", 550)
    expect(window.localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY)).toBe("360")
    expect(captured.size).toBe(0)
    expect(inputRef.current).toBe(input)
    expect(input.value).toBe("theme")
    expect(document.activeElement).toBe(input)
    expect(host.querySelector("[data-draft]")).toBe(draft)
    expect(draft.value).toBe("unsaved setting draft")
    expect(navigate).not.toHaveBeenCalled()
    await act(async () => root.unmount())
    root = createRoot(host)
    await mount()
    expect(width()).toBe(360)
  })

  it("supports keyboard steps, range ends and double-click reset", async () => {
    await mount()
    expect((await key("ArrowRight")).defaultPrevented).toBe(true)
    expect(width()).toBe(216)
    await key("ArrowRight", { shiftKey: true })
    expect(width()).toBe(248)
    await key("Home")
    expect(width()).toBe(180)
    await key("End")
    expect(width()).toBe(420)
    expect((await key("Enter")).defaultPrevented).toBe(false)
    await act(async () =>
      separator().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    )
    expect(width()).toBe(200)
    expect(window.localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY)).toBe("200")
  })

  it("cancels dragging with Escape without clearing the active search or saving the transient width", async () => {
    window.localStorage.setItem(SETTINGS_SIDEBAR_WIDTH_KEY, "260")
    await mount()
    const input = await query()
    await pointer("pointerdown", 260)
    await pointer("pointermove", 350)
    expect(width()).toBe(350)
    const escape = await key("Escape", {}, input)
    expect(escape.defaultPrevented).toBe(true)
    expect(width()).toBe(260)
    expect(input.value).toBe("theme")
    expect(input.getAttribute("aria-expanded")).toBe("true")
    expect(window.localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY)).toBe("260")
    expect(separator().dataset.resizing).toBe("false")
    expect(release).toHaveBeenCalledWith(1)
  })

  it.each(["pointercancel", "lostpointercapture", "blur"])(
    "cancels on %s and ignores unrelated pointers",
    async (type) => {
      await mount()
      await pointer("pointerdown", 200)
      await pointer("pointermove", 300, 2)
      expect(width()).toBe(200)
      await pointer("pointermove", 300)
      expect(width()).toBe(300)
      if (type === "blur")
        await act(async () => window.dispatchEvent(new Event("blur")))
      else await pointer(type, 300)
      expect(width()).toBe(200)
      expect(separator().dataset.resizing).toBe("false")
      expect(window.localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY)).toBeNull()
    }
  )

  it("fits a smaller window without overwriting the preferred width", async () => {
    window.localStorage.setItem(SETTINGS_SIDEBAR_WIDTH_KEY, "420")
    layoutWidth = 680
    await mount()
    expect(width()).toBe(360)
    expect(window.localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY)).toBe("420")
    layoutWidth = 1000
    await act(async () => window.dispatchEvent(new Event("resize")))
    expect(width()).toBe(420)
  })

  it("continues resizing when layout storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable")
    })
    await mount()
    expect(width()).toBe(200)
    await key("ArrowRight")
    expect(width()).toBe(216)
  })

  it("releases pointer ownership and global Escape handling on unmount", async () => {
    await mount()
    await pointer("pointerdown", 200)
    await pointer("pointermove", 300)
    await act(async () => root.unmount())
    expect(release).toHaveBeenCalledWith(1)
    const outside = document.createElement("input")
    document.body.append(outside)
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
    outside.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(false)
    outside.remove()
    root = createRoot(host)
  })
})
