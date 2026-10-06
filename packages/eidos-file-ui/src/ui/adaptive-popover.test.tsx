import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { expect, it } from "vitest"
import { EidosFileUIProvider } from "../context"
import { Popover, PopoverContent, PopoverTrigger } from "./adaptive-popover"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function Fixture() {
  const [draft, setDraft] = useState("")
  return (
    <EidosFileUIProvider interactionMode="mobile">
      <Popover>
        <PopoverTrigger>Settings</PopoverTrigger>
        <PopoverContent aria-label="Settings">
          <Popover>
            <PopoverTrigger>Filters</PopoverTrigger>
            <PopoverContent aria-label="Filters">
              <input
                aria-label="Draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Popover>
                <PopoverTrigger>Choose field</PopoverTrigger>
                <PopoverContent aria-label="Choose field">
                  <button>Title</button>
                </PopoverContent>
              </Popover>
            </PopoverContent>
          </Popover>
        </PopoverContent>
      </Popover>
    </EidosFileUIProvider>
  )
}

it("navigates nested settings within one dialog and backdrop, preserving the parent draft", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const click = async (text: string) => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (node) =>
        !node.closest("[hidden]") &&
        (node.textContent === text || node.getAttribute("aria-label") === text)
    )
    expect(button).toBeDefined()
    await act(async () => button!.click())
  }
  try {
    await act(async () => root.render(<Fixture />))
    await click("Settings")
    await click("Filters")
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Draft"]'
    )!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, "SQLite")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await click("Choose field")
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(
      document.querySelectorAll(".eidos-mobile-cell-backdrop")
    ).toHaveLength(1)
    expect(
      document.querySelector('[role="dialog"]')?.getAttribute("aria-label")
    ).toBe("Choose field")
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      )
    })
    expect(
      document.querySelector('[role="dialog"]')?.getAttribute("aria-label")
    ).toBe("Filters")
    expect(document.querySelector('input[aria-label="Draft"]')).toBe(input)
    expect(input.value).toBe("SQLite")
    expect(input.closest("[hidden]")).toBeNull()
    await click("Back")
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    await click("Filters")
    await click("Close")
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
