import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { BaseCreatePopover } from "./base-create-dialog"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("BaseCreatePopover", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("preselects the configured template without removing other choices", async () => {
    await act(async () => {
      root.render(
        <BaseCreatePopover
          open
          initialName="Tasks.base"
          initialTemplate="tasks"
          existingNames={[]}
          onOpenChange={() => undefined}
          onCreate={() => undefined}
        />
      )
    })

    const templateButtons = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")
    )
    expect(templateButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("Blank Base"),
      expect.stringContaining("Task tracker"),
    ])
    expect(
      templateButtons.find(
        (button) => button.getAttribute("aria-pressed") === "true"
      )?.textContent
    ).toContain("Task tracker")
  })
})
