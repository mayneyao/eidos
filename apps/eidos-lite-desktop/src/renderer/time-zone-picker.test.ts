// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TimeZonePicker } from "./time-zone-picker"

describe("TimeZonePicker", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean
      }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0)
        return 1
      },
    })
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    ;(
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean
      }
    ).IS_REACT_ACT_ENVIRONMENT = false
  })

  it("opens a searchable custom list and selects a matching city", () => {
    const onChange = vi.fn()
    act(() => {
      root.render(
        createElement(TimeZonePicker, {
          value: "America/New_York",
          label: "Time zone",
          onChange,
          t: (message: string) => message,
        })
      )
    })

    const trigger =
      container.querySelector<HTMLButtonElement>(".time-zone-trigger")
    expect(trigger).not.toBeNull()
    expect(container.querySelector("select")).toBeNull()
    act(() => trigger?.click())

    const input = document.body.querySelector<HTMLInputElement>(
      'input[role="combobox"]'
    )
    expect(input).not.toBeNull()
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setValue?.call(input, "London")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const london = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ].find((option) => option.textContent?.includes("London"))
    expect(london).not.toBeUndefined()
    act(() => london?.click())

    expect(onChange).toHaveBeenCalledWith("Europe/London")
    expect(document.body.querySelector(".time-zone-popover")).toBeNull()
  })
})
