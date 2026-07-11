// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { registerPendingWriteFlusher } from "@/apps/web-app/components/file-space/pending-writes"

import { VersionPanel } from "./version-panel"

const mocks = vi.hoisted(() => ({
  discardPath: vi.fn(async (request: { path: string }) => ({
    path: request.path,
    effect: "restored",
  })),
  openTab: vi.fn(),
  setActiveTab: vi.fn(),
  updateTab: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({
    location: {
      pathname: "/space-file",
      search: "",
      hash: "#open.md",
    },
    navigate: mocks.navigate,
  }),
}))

vi.mock("@/apps/web-app/hooks/use-space-versioning", () => ({
  useSpaceVersioning: () => ({
    status: {
      enabled: true,
      clean: false,
      hasConflicts: false,
      branch: "main",
      head: { id: "head-2" },
      changes: [{ path: "open.md", status: "modified", unstaged: true }],
    },
    history: [],
    statusLoading: false,
    historyLoading: false,
    operation: null,
    error: null,
    available: true,
    enable: vi.fn(),
    commit: vi.fn(),
    stagePath: vi.fn(),
    unstagePath: vi.fn(),
    discardPath: mocks.discardPath,
    refresh: vi.fn(),
  }),
}))

vi.mock("@/apps/web-app/store/tabs", () => ({
  useTabStore: (
    selector: (state: {
      openTab: typeof mocks.openTab
      setActiveTab: typeof mocks.setActiveTab
      tabs: unknown[]
      updateTab: typeof mocks.updateTab
    }) => unknown
  ) =>
    selector({
      openTab: mocks.openTab,
      setActiveTab: mocks.setActiveTab,
      tabs: [],
      updateTab: mocks.updateTab,
    }),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("VersionPanel changed-file diff", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.openTab.mockReset()
    mocks.discardPath.mockClear()
    mocks.setActiveTab.mockReset()
    mocks.updateTab.mockReset()
    mocks.navigate.mockReset()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("does not open a stale diff when the current editor cannot flush", async () => {
    const unregister = registerPendingWriteFlusher(
      "version-panel-failed-flush",
      async () => false,
      { spaceId: "space-a", filePath: "open.md" }
    )

    await act(async () => {
      root.render(<VersionPanel spaceId="space-a" />)
    })

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[title="open.md"]')
        ?.click()
      await Promise.resolve()
    })

    expect(mocks.openTab).not.toHaveBeenCalled()
    expect(container.textContent).toContain(
      "could not save the current file before opening this diff"
    )
    unregister()
  })

  it("requires the destructive dialog before discarding a changed path", async () => {
    const unregister = registerPendingWriteFlusher(
      "version-panel-discard-flush",
      async () => true,
      { spaceId: "space-a", filePath: "open.md" }
    )

    await act(async () => {
      root.render(<VersionPanel spaceId="space-a" />)
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Discard changes to open.md"]'
        )
        ?.click()
      await Promise.resolve()
    })

    expect(mocks.discardPath).not.toHaveBeenCalled()
    const confirm = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Discard changes"
    )
    expect(confirm).toBeDefined()
    await act(async () => {
      confirm?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.discardPath).toHaveBeenCalledWith({
      path: "open.md",
      expectedHead: "head-2",
      confirmed: true,
    })
    unregister()
  })
})
