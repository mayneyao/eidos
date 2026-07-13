// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { KanbanCard, KanbanProvider } from "./index"

interface DragStartTestEvent {
  active: {
    id: string
    data: {
      current?: {
        index: number
        name: string
        parent: string
      }
    }
  }
}

const dndMocks = vi.hoisted(() => ({
  onDragStart: undefined as ((event: DragStartTestEvent) => void) | undefined,
}))

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragStart,
  }: {
    children: ReactNode
    onDragStart?: (event: DragStartTestEvent) => void
  }) => {
    dndMocks.onDragStart = onDragStart
    return <div data-dnd-context>{children}</div>
  },
  DragOverlay: ({ children }: { children: ReactNode }) => (
    <div data-drag-overlay>{children}</div>
  ),
  rectIntersection: vi.fn(),
  useDraggable: () => ({
    attributes: {},
    isDragging: false,
    listeners: {},
    setNodeRef: vi.fn(),
  }),
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("KanbanProvider", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    dndMocks.onDragStart = undefined
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("uses draggable metadata instead of cloning the complete card DOM", () => {
    act(() => {
      root.render(
        <KanbanProvider onDragEnd={vi.fn()}>
          <KanbanCard
            id="row_1"
            index={0}
            name="A very detailed record"
            parent="todo"
          >
            <div>Heavy card content</div>
          </KanbanCard>
        </KanbanProvider>
      )
    })

    const card = container.querySelector<HTMLElement>(
      '[data-draggable-id="row_1"]'
    )
    expect(card).not.toBeNull()
    let innerHtmlReads = 0
    Object.defineProperty(card, "innerHTML", {
      configurable: true,
      get: () => {
        innerHtmlReads += 1
        return "<span>Cloned heavy content</span>"
      },
    })

    act(() => {
      dndMocks.onDragStart?.({
        active: {
          id: "row_1",
          data: {
            current: {
              index: 0,
              name: "A very detailed record",
              parent: "todo",
            },
          },
        },
      })
    })

    expect(innerHtmlReads).toBe(0)
    expect(
      container.querySelector("[data-drag-overlay]")?.textContent
    ).toContain("A very detailed record")
  })
})
