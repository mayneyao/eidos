// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { registerPendingWriteFlusher } from "@/apps/web-app/components/file-space/pending-writes"

import { VersionPanel } from "./version-panel"

const mocks = vi.hoisted(() => ({
  changes: [{ path: "open.md", status: "modified", unstaged: true }] as Array<{
    path: string
    status: string
    unstaged?: boolean
    staged?: boolean
    conflicted?: boolean
  }>,
  mergeHead: null as string | null,
  discardPath: vi.fn(async (request: { path: string }) => ({
    path: request.path,
    effect: "restored",
  })),
  stagePath: vi.fn(async (request: { path: string }) => ({
    path: request.path,
  })),
  unstagePath: vi.fn(async (request: { path: string }) => ({
    path: request.path,
  })),
  openTab: vi.fn(),
  setActiveTab: vi.fn(),
  updateTab: vi.fn(),
  navigate: vi.fn(),
  resolveConflict: vi.fn(
    async (request: { path: string; resolution: string }) => ({
      path: request.path,
      resolution: request.resolution,
      remainingConflicts: 0,
      status: { hasConflicts: false },
    })
  ),
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
      mergeHead: mocks.mergeHead,
      head: { id: "head-2" },
      changes: mocks.changes,
      remoteNames: [],
      upstream: null,
      ahead: 0,
      behind: 0,
    },
    history: [],
    statusLoading: false,
    historyLoading: false,
    operation: null,
    error: null,
    available: true,
    enable: vi.fn(),
    commit: vi.fn(),
    stagePath: mocks.stagePath,
    unstagePath: mocks.unstagePath,
    discardPath: mocks.discardPath,
    fetchRemote: vi.fn(),
    pullRemote: vi.fn(),
    pushRemote: vi.fn(),
    resolveConflict: mocks.resolveConflict,
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
    mocks.changes = [{ path: "open.md", status: "modified", unstaged: true }]
    mocks.mergeHead = null
    mocks.openTab.mockReset()
    mocks.discardPath.mockClear()
    mocks.stagePath.mockClear()
    mocks.unstagePath.mockClear()
    mocks.setActiveTab.mockReset()
    mocks.updateTab.mockReset()
    mocks.navigate.mockReset()
    mocks.resolveConflict.mockClear()
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

  it("confirms and discards every change below a directory", async () => {
    mocks.changes = [
      { path: "notes/one.md", status: "modified", unstaged: true },
      { path: "notes/nested/two.md", status: "untracked", unstaged: true },
    ]

    await act(async () => {
      root.render(<VersionPanel spaceId="space-a" />)
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Discard changes in directory notes"]'
        )
        ?.click()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain(
      "Discard changes in this folder?"
    )
    expect(document.body.textContent).toContain("every changed file inside it")
    const confirm = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Discard changes"
    )
    await act(async () => {
      confirm?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.discardPath).toHaveBeenCalledWith({
      path: "notes",
      expectedHead: "head-2",
      confirmed: true,
    })
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it("discards only status-matched versioned roots below .eidos", async () => {
    mocks.changes = [
      {
        path: ".eidos/extensions/local.counter/src/extension.ts",
        status: "modified",
        unstaged: true,
      },
      {
        path: ".eidos/agent/sessions/conversation-a/events.jsonl",
        status: "modified",
        unstaged: true,
      },
    ]

    await act(async () => {
      root.render(<VersionPanel spaceId="space-a" />)
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Discard changes in directory .eidos"]'
        )
        ?.click()
      await Promise.resolve()
    })

    const confirm = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Discard changes"
    )
    await act(async () => {
      confirm?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.discardPath).toHaveBeenCalledTimes(2)
    expect(
      mocks.discardPath.mock.calls.map(([request]) => request.path)
    ).toEqual([".eidos/agent/sessions", ".eidos/extensions"])
    expect(mocks.discardPath).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: ".eidos" })
    )
  })

  it("collapses each change section independently", async () => {
    mocks.changes = [
      { path: "published/one.md", status: "modified", staged: true },
      { path: "drafts/two.md", status: "modified", unstaged: true },
    ]

    await act(async () => {
      root.render(<VersionPanel spaceId="space-a" />)
    })

    const stagedToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse Staged Changes"]'
    )
    const changesToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse Changes"]'
    )
    expect(stagedToggle?.getAttribute("aria-expanded")).toBe("true")
    expect(changesToggle?.getAttribute("aria-expanded")).toBe("true")
    const stagedContent = document.getElementById(
      stagedToggle?.getAttribute("aria-controls") ?? ""
    ) as HTMLDivElement | null
    const changesContent = document.getElementById(
      changesToggle?.getAttribute("aria-controls") ?? ""
    ) as HTMLDivElement | null

    await act(async () => stagedToggle?.click())
    expect(stagedToggle?.getAttribute("aria-expanded")).toBe("false")
    expect(stagedContent?.hidden).toBe(true)
    expect(changesContent?.hidden).toBe(false)

    await act(async () => changesToggle?.click())
    expect(changesToggle?.getAttribute("aria-expanded")).toBe("false")
    expect(changesContent?.hidden).toBe(true)
  })

  it("includes or excludes a whole section using top-level path groups", async () => {
    mocks.changes = [
      { path: "published/one.md", status: "modified", staged: true },
      { path: "published/nested/two.md", status: "added", staged: true },
      {
        path: ".eidos/extensions/local.reader/extension.json",
        status: "modified",
        staged: true,
      },
      { path: "drafts/one.md", status: "modified", unstaged: true },
      { path: "drafts/nested/two.md", status: "untracked", unstaged: true },
      {
        path: ".eidos/extensions/local.counter/src/extension.ts",
        status: "modified",
        unstaged: true,
      },
      {
        path: ".eidos/agent/sessions/conversation-a/events.jsonl",
        status: "modified",
        unstaged: true,
      },
      { path: "root.md", status: "modified", unstaged: true },
    ]

    await act(async () => {
      root.render(<VersionPanel spaceId="space-a" />)
    })

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Include all changes in the next version"]'
        )
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.stagePath.mock.calls.map(([request]) => request)).toEqual([
      { path: ".eidos/agent/sessions", expectedHead: "head-2" },
      { path: ".eidos/extensions", expectedHead: "head-2" },
      { path: "drafts", expectedHead: "head-2" },
      { path: "root.md", expectedHead: "head-2" },
    ])

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Exclude all staged changes from the next version"]'
        )
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.unstagePath.mock.calls.map(([request]) => request)).toEqual([
      { path: ".eidos/extensions", expectedHead: "head-2" },
      { path: "published", expectedHead: "head-2" },
    ])
  })

  it("requires conflicts to be resolved before including the whole section", async () => {
    mocks.changes = [
      {
        path: "conflict.md",
        status: "conflicted",
        unstaged: true,
        conflicted: true,
      },
    ]

    await act(async () => {
      root.render(<VersionPanel spaceId="space-a" />)
    })

    const includeAll = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Include all changes in the next version"]'
    )
    expect(includeAll?.disabled).toBe(true)
    expect(includeAll?.title).toBe(
      "Resolve conflicts before including all changes"
    )
  })

  it("opens ours-to-theirs diff and a dedicated conflict review tab", async () => {
    mocks.changes = [
      {
        path: "conflict.md",
        status: "conflicted",
        unstaged: true,
        conflicted: true,
      },
    ]
    mocks.mergeHead = "remote-2"

    await act(async () => {
      root.render(<VersionPanel spaceId="space-a" />)
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[title="conflict.md"]')
        ?.click()
      await Promise.resolve()
    })
    expect(mocks.openTab).toHaveBeenCalledWith(
      "/version/diff?path=conflict.md&from=head-2&to=remote-2",
      "conflict.md (Diff)"
    )

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Resolve conflict in conflict.md"]'
        )
        ?.click()
      await Promise.resolve()
    })
    expect(mocks.openTab).toHaveBeenLastCalledWith(
      "/version/conflicts?path=conflict.md",
      "Resolve Conflicts"
    )
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
  })
})
