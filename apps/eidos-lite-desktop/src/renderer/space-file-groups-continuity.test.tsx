// @vitest-environment jsdom
import { act, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { SpaceFileGroups } from "./space-file-groups"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const originalScrollTo = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo"
)
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalScrollTo)
    Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo)
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
})

it("retains real virtual rows, their DOM and scroll offset while the other layout is visible", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320)
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("explorer-card-scroll") ? 300 : 50
    }
  )
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? this.scrollTop
    },
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const props: ComponentProps<typeof SpaceFileGroups> = {
    spaceId: "continuity",
    entries: Array.from({ length: 80 }, (_, index) => ({
      name: String(index).padStart(2, "0") + ".png",
      relativePath: String(index).padStart(2, "0") + ".png",
      kind: "file",
      size: 1,
      modifiedAtMs: Date.now(),
    })),
    sort: { by: "name", direction: "ascending" },
    visible: true,
    activePath: null,
    revealToken: 0,
    disabled: false,
    loading: false,
    hasFilter: false,
    renameRequest: null,
    onRetry: vi.fn(),
    onClearFilter: vi.fn(),
    onShowTree: vi.fn(),
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onRenameError: vi.fn(),
    onContextMenu: vi.fn(),
  }
  const render = async (visible: boolean) => {
    await act(async () =>
      root.render(<SpaceFileGroups {...props} visible={visible} />)
    )
  }
  vi.stubGlobal("eidosLite", {
    listExplorerFiles: vi.fn().mockResolvedValue({
      entries: props.entries,
      earlierCount: 0,
      total: props.entries.length,
      hasMore: false,
    }),
  })
  try {
    await render(true)
    const scroll = host.querySelector<HTMLElement>(".explorer-card-scroll")!
    await act(async () => {
      scroll.scrollTop = 700
      scroll.dispatchEvent(new Event("scroll"))
    })
    const first = host.querySelector(".explorer-card-open")!
    // The virtualizer may anchor the initial scroll as estimated media rows
    // are measured. Switching layouts must preserve that settled offset.
    const settledScrollTop = scroll.scrollTop
    expect(settledScrollTop).toBeGreaterThan(0)
    expect(first).not.toBeNull()
    expect(first.getAttribute("data-path")).not.toBe("00.png")
    await render(false)
    expect(host.querySelector(".explorer-card-open")).toBe(first)
    await render(true)
    expect(host.querySelector(".explorer-card-open")).toBe(first)
    expect(scroll.scrollTop).toBe(settledScrollTop)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
