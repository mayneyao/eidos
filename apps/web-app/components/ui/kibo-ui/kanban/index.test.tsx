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

interface DragEndTestEvent extends DragStartTestEvent {
  over: { id: string } | null
}

const dndMocks = vi.hoisted(() => ({
  draggableRenders: new Map<string, number>(),
  onDragStart: undefined as ((event: DragStartTestEvent) => void) | undefined,
  onDragEnd: undefined as ((event: DragEndTestEvent) => void) | undefined,
  pointerDown: vi.fn(),
  keyDown: vi.fn(),
  sensors: undefined as
    | Array<{ sensor: unknown; options?: Record<string, unknown> }>
    | undefined,
}))

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragEnd,
    onDragStart,
    sensors,
  }: {
    children: ReactNode
    onDragEnd?: (event: DragEndTestEvent) => void
    onDragStart?: (event: DragStartTestEvent) => void
    sensors?: Array<{ sensor: unknown; options?: Record<string, unknown> }>
  }) => {
    dndMocks.onDragEnd = onDragEnd
    dndMocks.onDragStart = onDragStart
    dndMocks.sensors = sensors
    return <div data-dnd-context>{children}</div>
  },
  DragOverlay: ({ children }: { children: ReactNode }) => (
    <div data-drag-overlay>{children}</div>
  ),
  KeyboardSensor: "keyboard-sensor",
  PointerSensor: "pointer-sensor",
  rectIntersection: vi.fn(),
  useSensor: (sensor: unknown, options?: Record<string, unknown>) => ({
    sensor,
    options,
  }),
  useSensors: (...sensors: unknown[]) => sensors,
  useDraggable: ({ id }: { id: string }) => {
    dndMocks.draggableRenders.set(
      id,
      (dndMocks.draggableRenders.get(id) ?? 0) + 1
    )
    return {
      attributes: {},
      isDragging: false,
      listeners: {
        onKeyDown: dndMocks.keyDown,
        onPointerDown: dndMocks.pointerDown,
      },
      setNodeRef: vi.fn(),
    }
  },
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("KanbanProvider", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    dndMocks.draggableRenders.clear()
    dndMocks.keyDown.mockReset()
    dndMocks.onDragEnd = undefined
    dndMocks.onDragStart = undefined
    dndMocks.pointerDown.mockReset()
    dndMocks.sensors = undefined
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

  it("requires deliberate pointer movement and leaves nested actions interactive", () => {
    act(() => {
      root.render(
        <KanbanProvider onDragEnd={vi.fn()}>
          <KanbanCard id="row_1" index={0} name="Task" parent="todo">
            <button type="button">Open task</button>
          </KanbanCard>
        </KanbanProvider>
      )
    })

    const pointerSensor = dndMocks.sensors?.find(
      (descriptor) => descriptor.sensor === "pointer-sensor"
    )
    expect(pointerSensor?.options).toEqual({
      activationConstraint: { distance: 6 },
    })

    const action = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open task"
    )
    expect(action).toBeDefined()
    act(() => {
      action?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
      action?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
      )
    })

    expect(dndMocks.pointerDown).not.toHaveBeenCalled()
    expect(dndMocks.keyDown).not.toHaveBeenCalled()
  })

  it("does not show moved feedback for cancelled or same-column drops", () => {
    act(() => {
      root.render(
        <KanbanProvider onDragEnd={vi.fn()}>
          <KanbanCard id="row_1" index={0} name="Task" parent="todo" />
        </KanbanProvider>
      )
    })

    const event: DragEndTestEvent = {
      active: {
        id: "row_1",
        data: { current: { index: 0, name: "Task", parent: "todo" } },
      },
      over: null,
    }
    act(() => dndMocks.onDragEnd?.(event))
    expect(
      container.querySelector('[data-draggable-id="row_1"]')?.className
    ).not.toContain("ring-1")

    act(() =>
      dndMocks.onDragEnd?.({
        ...event,
        over: { id: "todo" },
      })
    )
    expect(
      container.querySelector('[data-draggable-id="row_1"]')?.className
    ).not.toContain("ring-1")

    act(() =>
      dndMocks.onDragEnd?.({
        ...event,
        over: { id: "done" },
      })
    )
    expect(
      container.querySelector('[data-draggable-id="row_1"]')?.className
    ).toContain("ring-1")
  })

  it("updates drag feedback without rerendering unrelated cards", () => {
    act(() => {
      root.render(
        <KanbanProvider onDragEnd={vi.fn()}>
          <KanbanCard id="row_1" index={0} name="First" parent="todo" />
          <KanbanCard id="row_2" index={1} name="Second" parent="todo" />
        </KanbanProvider>
      )
    })

    expect(dndMocks.draggableRenders.get("row_1")).toBe(1)
    expect(dndMocks.draggableRenders.get("row_2")).toBe(1)

    const event: DragEndTestEvent = {
      active: {
        id: "row_1",
        data: { current: { index: 0, name: "First", parent: "todo" } },
      },
      over: { id: "done" },
    }
    act(() => {
      dndMocks.onDragStart?.(event)
    })

    expect(dndMocks.draggableRenders.get("row_1")).toBe(1)
    expect(dndMocks.draggableRenders.get("row_2")).toBe(1)

    act(() => {
      dndMocks.onDragEnd?.(event)
    })

    expect(dndMocks.draggableRenders.get("row_1")).toBe(2)
    expect(dndMocks.draggableRenders.get("row_2")).toBe(1)
  })
})
