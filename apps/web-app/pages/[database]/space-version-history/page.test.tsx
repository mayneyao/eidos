// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SpaceVersionHistoryPage } from "./page"

const mocks = vi.hoisted(() => ({
  viewportWidth: 1440,
}))

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 0,
    getVirtualItems: () => [],
    scrollToIndex: vi.fn(),
  }),
}))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({ currentSpace: { id: "space-a" } }),
}))

vi.mock("@/apps/web-app/hooks/use-tab-title", () => ({
  useTabTitle: () => undefined,
}))

vi.mock("@/apps/web-app/components/tab-manager/tab-context", () => ({
  useTabContext: () => ({ isActive: true }),
}))

vi.mock("@/apps/web-app/hooks/use-space-versioning", () => ({
  useSpaceVersioning: () => ({
    status: {
      enabled: true,
      clean: true,
      hasConflicts: false,
      branch: "main",
      head: null,
      changes: [],
    },
    history: [],
    historyHasMore: false,
    statusLoading: false,
    historyLoading: false,
    historyLoadingMore: false,
    operation: null,
    error: null,
    available: true,
    enable: vi.fn(),
    getCommit: vi.fn(),
    getDiff: vi.fn(),
    restorePath: vi.fn(),
    restoreVersion: vi.fn(),
    refresh: vi.fn(),
    loadMoreHistory: vi.fn(),
  }),
}))

vi.mock(
  "@/apps/web-app/components/file-space/versioning/commit-inspector",
  () => ({
    CommitInspector: ({ placement }: { placement: "side" | "below" }) => (
      <div data-testid="mock-commit-inspector" data-placement={placement} />
    ),
  })
)

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("SpaceVersionHistoryPage layout", () => {
  let container: HTMLDivElement
  let root: Root
  let rectSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mocks.viewportWidth = 1440
    rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(
        () =>
          ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: mocks.viewportWidth,
            bottom: 800,
            width: mocks.viewportWidth,
            height: 800,
            toJSON: () => ({}),
          }) as DOMRect
      )
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    rectSpy.mockRestore()
    container.remove()
  })

  async function renderPage() {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/version/history"]}>
          <SpaceVersionHistoryPage />
        </MemoryRouter>
      )
      await Promise.resolve()
    })
  }

  it("keeps the history log bounded and gives the review pane the remaining width", async () => {
    await renderPage()

    const workspace = container.querySelector(
      '[data-testid="version-history-workspace"]'
    )
    const logPane = container.querySelector(
      '[data-testid="version-history-log-pane"]'
    )
    const detailPane = container.querySelector(
      '[data-testid="version-history-detail-pane"]'
    )
    const inspector = container.querySelector(
      '[data-testid="mock-commit-inspector"]'
    )

    expect(workspace?.className).not.toContain("flex-col")
    expect(logPane?.className).toContain("w-[clamp(320px,28vw,460px)]")
    expect(detailPane?.className).toContain("flex-1")
    expect(inspector?.getAttribute("data-placement")).toBe("side")
    expect(container.textContent).toContain("Graph")
    expect(container.textContent).not.toContain("PathsWhen")
  })

  it("stacks navigation above the review pane when the workspace is narrow", async () => {
    mocks.viewportWidth = 800
    await renderPage()

    expect(
      container.querySelector('[data-testid="version-history-workspace"]')
        ?.className
    ).toContain("flex-col")
    expect(
      container.querySelector('[data-testid="version-history-log-pane"]')
        ?.className
    ).toContain("flex-[0.8_1_0%]")
    expect(
      container.querySelector('[data-testid="version-history-detail-pane"]')
        ?.className
    ).toContain("flex-[1.2_1_0%]")
    expect(
      container
        .querySelector('[data-testid="mock-commit-inspector"]')
        ?.getAttribute("data-placement")
    ).toBe("below")
  })
})
