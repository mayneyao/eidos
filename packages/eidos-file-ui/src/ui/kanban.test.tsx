// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { KanbanCard } from "./kanban"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("KanbanCard", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("keeps read-only card content at full contrast", () => {
    act(() => {
      root.render(
        <KanbanCard
          id="record-1"
          name="Roadmap"
          index={0}
          parent="planned"
          disabled
        />
      )
    })

    const card = container.querySelector<HTMLElement>(
      '[data-draggable-id="record-1"]'
    )
    expect(card?.classList).toContain("cursor-default")
    expect(card?.classList).not.toContain("opacity-60")
  })
})
