import { act, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  useEidosFileGallerySelection,
  type GallerySelectionGeometry,
} from "./use-eidos-file-gallery-selection"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("Gallery pointer selection lifecycle", () => {
  let host: HTMLDivElement
  let root: Root
  let surface: HTMLDivElement
  let scope: string
  let layout: string
  let enabled: boolean
  let geometry: GallerySelectionGeometry
  const open = vi.fn()
  const capture = vi.fn()
  const release = vi.fn()

  function Harness() {
    const ref = useRef<HTMLDivElement>(null)
    const selection = useEidosFileGallerySelection({
      scrollRef: ref,
      getGeometry: () => geometry,
      enabled,
      scopeKey: scope,
      queryIdentity: "stable-source",
      layoutKey: layout,
    })
    return (
      <div
        ref={ref}
        tabIndex={0}
        data-surface
        style={{ userSelect: selection.marquee ? "none" : undefined }}
      >
        <article data-eidos-file-row-id="a" onClick={open}>
          <span>Card A</span>
          <button onClick={open}>Preview</button>
        </article>
        <output>{[...selection.selectedIds].sort().join(",")}</output>
        {selection.marquee ? <div data-marquee /> : null}
      </div>
    )
  }

  const selected = () => host.querySelector("output")?.textContent
  const render = () => act(() => root.render(<Harness />))
  function pointer(
    type: string,
    target: EventTarget,
    x: number,
    y: number,
    extra: Partial<PointerEvent> = {}
  ) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: extra.button ?? 0,
      shiftKey: extra.shiftKey,
      metaKey: extra.metaKey,
      ctrlKey: extra.ctrlKey,
    })
    Object.defineProperties(event, {
      pointerId: { value: extra.pointerId ?? 1 },
      pointerType: { value: extra.pointerType ?? "mouse" },
      isPrimary: { value: true },
    })
    act(() => target.dispatchEvent(event))
  }
  const down = (x = 5, y = 5, extra: Partial<PointerEvent> = {}) =>
    pointer("pointerdown", surface, x, y, extra)
  const move = (x = 150, y = 130) => pointer("pointermove", window, x, y)
  const up = (x = 150, y = 130) => pointer("pointerup", window, x, y)
  const key = (target: EventTarget, value = "Escape") =>
    act(() =>
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: value,
        })
      )
    )

  beforeEach(() => {
    scope = "table:view:query1"
    layout = "3:280"
    enabled = true
    geometry = {
      logicalScrollOffset: 0,
      cards: new Map([
        ["a", { left: 20, top: 20, right: 120, bottom: 120 }],
        ["b", { left: 140, top: 20, right: 240, bottom: 120 }],
      ]),
    }
    open.mockReset()
    capture.mockReset()
    release.mockReset()
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    render()
    surface = host.querySelector("[data-surface]")!
    Object.defineProperties(surface, {
      clientWidth: { value: 600, configurable: true },
      clientHeight: { value: 400, configurable: true },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 615, bottom: 400 }),
      },
      setPointerCapture: { value: capture },
      hasPointerCapture: {
        value: () => capture.mock.calls.length > release.mock.calls.length,
      },
      releasePointerCapture: { value: release },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("starts after the threshold, retains selection and suppresses the drag's click", () => {
    down()
    move(8, 8)
    expect(host.querySelector("[data-marquee]")).toBeNull()
    move()
    expect(selected()).toBe("a,b")
    expect(capture).toHaveBeenCalledWith(1)
    expect(surface.style.userSelect).toBe("none")
    up()
    act(() =>
      host
        .querySelector("article")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
    )
    expect(open).not.toHaveBeenCalled()
    expect(selected()).toBe("a,b")
    expect(release).toHaveBeenCalledWith(1)
    expect(surface.style.userSelect).toBe("")
    expect(host.querySelector("[data-marquee]")).toBeNull()
  })

  it("appends/toggles relative to the starting IDs and clears with a blank click", () => {
    down()
    move(125, 130)
    up(125, 130)
    expect(selected()).toBe("a")
    down(130, 5, { shiftKey: true })
    move(250, 130)
    up(250, 130)
    expect(selected()).toBe("a,b")
    down(5, 5, { ctrlKey: true })
    move(125, 130)
    move(125, 130)
    up(125, 130)
    expect(selected()).toBe("b")
    down()
    up(5, 5)
    expect(selected()).toBe("")
  })

  it("starts a marquee from card content while an ordinary card click still opens", () => {
    const title = host.querySelector("span")!
    pointer("pointerdown", title, 30, 30)
    move(250, 130)
    expect(selected()).toBe("a,b")
    up(250, 130)
    act(() =>
      title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
    )
    expect(open).not.toHaveBeenCalled()
    pointer("pointerdown", title, 30, 30)
    up(30, 30)
    act(() =>
      title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
    )
    expect(open).toHaveBeenCalledOnce()
    expect(selected()).toBe("a,b")
  })

  it("suppresses a delayed trailing click until the next deliberate press", async () => {
    down()
    move()
    up()
    await new Promise((resolve) => setTimeout(resolve, 10))
    act(() =>
      host
        .querySelector("article")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
    )
    expect(open).not.toHaveBeenCalled()
    expect(selected()).toBe("a,b")
  })

  it("keeps completed selection through a temporary loading gate", () => {
    down()
    move()
    up()
    enabled = false
    render()
    enabled = true
    render()
    expect(selected()).toBe("a,b")
  })

  it("keeps identities and hit geometry as virtual row data is evicted during one drag", () => {
    down()
    move()
    geometry = {
      logicalScrollOffset: 5000,
      cards: new Map([
        ["c", { left: 20, top: 5020, right: 120, bottom: 5120 }],
      ]),
    }
    render()
    move()
    expect(selected()).toBe("a,b,c")
    // Shrinking the same gesture must also remove previously encountered hits.
    geometry = { logicalScrollOffset: 0, cards: new Map() }
    render()
    move()
    expect(selected()).toBe("a,b")
    geometry = { logicalScrollOffset: 5000, cards: new Map() }
    move()
    expect(selected()).toBe("a,b,c")
    up()
    render()
    expect(selected()).toBe("a,b,c")
  })

  it("restores the base on cancel/blur and clears with Escape, releasing capture", () => {
    down()
    move(125, 130)
    up(125, 130)
    down(130, 5, { shiftKey: true })
    move(250, 130)
    expect(selected()).toBe("a,b")
    pointer("pointercancel", window, 250, 130)
    expect(selected()).toBe("a")
    down(130, 5, { shiftKey: true })
    move(250, 130)
    act(() => window.dispatchEvent(new Event("blur")))
    expect(selected()).toBe("a")
    down()
    move()
    key(window)
    expect(selected()).toBe("")
    expect(host.querySelector("[data-marquee]")).toBeNull()
    move()
    up()
    expect(selected()).toBe("")
    expect(release.mock.calls.length).toBe(capture.mock.calls.length)
  })

  it("preserves selection on pending pointercancel, cancels relayout, resets query scope", () => {
    down()
    move()
    up()
    down()
    pointer("pointercancel", window, 5, 5)
    expect(selected()).toBe("a,b")
    down()
    move(125, 130)
    layout = "2:340"
    render()
    expect(selected()).toBe("a,b")
    expect(host.querySelector("[data-marquee]")).toBeNull()
    scope = "table:view:query2"
    render()
    expect(selected()).toBe("")
    move()
    up()
    expect(selected()).toBe("")
  })

  it("ignores controls, native drag targets, touch, other pointers, native scrollbars and disabled mode", () => {
    host.querySelector("span")!.setAttribute("draggable", "true")
    for (const target of [
      host.querySelector("span")!,
      host.querySelector("button")!,
    ]) {
      pointer("pointerdown", target, 5, 5)
      move()
      up()
      expect(selected()).toBe("")
    }
    down(5, 5, { pointerType: "touch" })
    move()
    up()
    down(605, 5)
    move()
    up()
    down(5, 5, { button: 2 })
    move()
    up()
    expect(selected()).toBe("")
    down()
    pointer("pointermove", window, 150, 130, { pointerId: 2 })
    expect(host.querySelector("[data-marquee]")).toBeNull()
    pointer("pointercancel", window, 5, 5)
    enabled = false
    render()
    down()
    move()
    up()
    expect(selected()).toBe("")
  })

  it("cleans up an active captured pointer on unmount", () => {
    down()
    move()
    act(() => root.unmount())
    expect(release).toHaveBeenCalledWith(1)
    pointer("pointermove", window, 250, 200)
    pointer("pointerup", window, 250, 200)
    root = createRoot(host)
  })
})
