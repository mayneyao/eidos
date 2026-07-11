import { afterEach } from "vitest"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

const roots = new Set<Root>()
const emptyRect = (): DOMRect =>
  ({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect

if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: emptyRect,
  })
}

if (typeof globalThis.DragEvent === "undefined") {
  class DragEventPolyfill extends Event {
    readonly dataTransfer: DataTransfer | null

    constructor(
      type: string,
      init: EventInit & { dataTransfer?: DataTransfer | null } = {}
    ) {
      super(type, init)
      this.dataTransfer = init.dataTransfer ?? null
    }
  }

  Object.defineProperty(globalThis, "DragEvent", {
    configurable: true,
    value: DragEventPolyfill,
  })
}

if (typeof globalThis.ClipboardEvent === "undefined") {
  class ClipboardEventPolyfill extends Event {
    readonly clipboardData: DataTransfer | null

    constructor(
      type: string,
      init: EventInit & { clipboardData?: DataTransfer | null } = {}
    ) {
      super(type, init)
      this.clipboardData = init.clipboardData ?? null
    }
  }

  Object.defineProperty(globalThis, "ClipboardEvent", {
    configurable: true,
    value: ClipboardEventPolyfill,
  })
}

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

export function render(ui: React.ReactNode): HTMLElement {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  act(() => root.render(ui))
  return container
}

export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount()
  })
  roots.clear()
  document.body.replaceChildren()
})
