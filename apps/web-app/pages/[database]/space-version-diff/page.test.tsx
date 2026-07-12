// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SpaceVersionDiffPage } from "./page"

const mocks = vi.hoisted(() => ({
  getDiff: vi.fn(),
  openTab: vi.fn(),
  readText: vi.fn(),
  refreshStatus: vi.fn(async () => undefined),
  status: null as unknown,
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

vi.mock("@/apps/web-app/hooks/use-space-files", () => ({
  useSpaceFiles: () => ({ readText: mocks.readText }),
}))

vi.mock("@/apps/web-app/hooks/use-space-versioning", () => ({
  useSpaceVersioning: () => ({
    status: mocks.status,
    statusLoading: false,
    available: true,
    getDiff: mocks.getDiff,
    refreshStatus: mocks.refreshStatus,
  }),
}))

vi.mock("@/apps/web-app/store/tabs", () => ({
  useTabStore: (
    selector: (state: { openTab: typeof mocks.openTab }) => unknown
  ) => selector({ openTab: mocks.openTab }),
}))

vi.mock("@/components/table/diff-view", () => ({
  DiffView: ({
    oldContent,
    newContent,
    diffStyle,
  }: {
    oldContent: string
    newContent: string
    diffStyle: string
  }) => (
    <div
      data-testid="diff-view"
      data-old={oldContent}
      data-new={newContent}
      data-style={diffStyle}
    />
  ),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

async function flushEffects() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("SpaceVersionDiffPage", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.getDiff.mockReset()
    mocks.openTab.mockReset()
    mocks.readText.mockReset()
    mocks.refreshStatus.mockClear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("loads HEAD-to-worktree text content into the dedicated diff view", async () => {
    mocks.status = {
      enabled: true,
      clean: false,
      hasConflicts: false,
      branch: "main",
      head: { id: "head-2" },
      changes: [{ path: "notes/today.md", status: "modified", unstaged: true }],
    }
    mocks.getDiff
      .mockResolvedValueOnce({
        currentHead: "head-2",
        currentBranch: "main",
        from: "head-2",
        to: "worktree",
        paths: [
          {
            path: "notes/today.md",
            change: "modified",
            kind: "text_file",
            storage: "inline",
          },
        ],
        content: null,
      })
      .mockResolvedValueOnce({
        currentHead: "head-2",
        currentBranch: "main",
        from: "head-2",
        to: "worktree",
        paths: [],
        content: {
          path: "notes/today.md",
          change: "modified",
          kind: "text_file",
          storage: "inline",
          before: {
            state: "utf8",
            content: "before\n",
            size: 7,
            contentHash: "before",
          },
          after: {
            state: "utf8",
            content: "after\n",
            size: 6,
            contentHash: "after",
          },
        },
      })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/version/diff?path=notes%2Ftoday.md"]}>
          <SpaceVersionDiffPage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    expect(mocks.getDiff).toHaveBeenNthCalledWith(1, {
      from: "head-2",
      path: "notes/today.md",
    })
    expect(mocks.getDiff).toHaveBeenNthCalledWith(2, {
      from: "head-2",
      path: "notes/today.md",
      includeContent: true,
    })
    const diff = container.querySelector<HTMLElement>(
      '[data-testid="diff-view"]'
    )
    expect(diff?.dataset.old).toBe("before\n")
    expect(diff?.dataset.new).toBe("after\n")
    expect(diff?.dataset.style).toBe("split")
  })

  it("loads an explicit ours-to-theirs conflict diff", async () => {
    mocks.status = {
      enabled: true,
      clean: false,
      hasConflicts: true,
      branch: "main",
      head: { id: "head-2" },
      changes: [
        {
          path: "notes/conflict.md",
          status: "conflicted",
          conflicted: true,
        },
      ],
    }
    mocks.getDiff
      .mockResolvedValueOnce({
        paths: [
          {
            path: "notes/conflict.md",
            change: "modified",
            kind: "text_file",
            storage: "inline",
          },
        ],
      })
      .mockResolvedValueOnce({
        paths: [],
        content: {
          path: "notes/conflict.md",
          change: "modified",
          kind: "text_file",
          storage: "inline",
          before: {
            state: "utf8",
            content: "ours\n",
            size: 5,
            contentHash: "ours",
          },
          after: {
            state: "utf8",
            content: "theirs\n",
            size: 7,
            contentHash: "theirs",
          },
        },
      })

    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={[
            "/version/diff?path=notes%2Fconflict.md&from=head-2&to=remote-2",
          ]}
        >
          <SpaceVersionDiffPage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    expect(mocks.getDiff).toHaveBeenNthCalledWith(1, {
      from: "head-2",
      to: "remote-2",
      path: "notes/conflict.md",
    })
    expect(mocks.getDiff).toHaveBeenNthCalledWith(2, {
      from: "head-2",
      to: "remote-2",
      path: "notes/conflict.md",
      includeContent: true,
    })
    expect(container.textContent).toContain("head-2 → remote-")
  })

  it("shows an empty-tree diff for an untracked file before the first version", async () => {
    mocks.status = {
      enabled: true,
      clean: false,
      hasConflicts: false,
      branch: "main",
      head: null,
      changes: [{ path: "draft.md", status: "untracked", unstaged: true }],
    }
    mocks.readText.mockResolvedValue({
      path: "draft.md",
      content: "# Draft\n",
      size: 8,
      mtimeMs: 1,
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/version/diff?path=draft.md"]}>
          <SpaceVersionDiffPage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    expect(mocks.getDiff).not.toHaveBeenCalled()
    expect(mocks.readText).toHaveBeenCalledWith("draft.md")
    const diff = container.querySelector<HTMLElement>(
      '[data-testid="diff-view"]'
    )
    expect(diff?.dataset.old).toBe("")
    expect(diff?.dataset.new).toBe("# Draft\n")
    expect(container.textContent).toContain("Empty Space → working file")
  })

  it("shows working content for an untracked file when the Space already has history", async () => {
    mocks.status = {
      enabled: true,
      clean: false,
      hasConflicts: false,
      branch: "main",
      head: { id: "head-2" },
      changes: [{ path: "draft.md", status: "untracked", unstaged: true }],
    }
    mocks.readText.mockResolvedValue({
      path: "draft.md",
      content: "# New draft\n",
      size: 12,
      mtimeMs: 1,
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/version/diff?path=draft.md"]}>
          <SpaceVersionDiffPage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    expect(mocks.getDiff).not.toHaveBeenCalled()
    expect(mocks.readText).toHaveBeenCalledWith("draft.md")
    const diff = container.querySelector<HTMLElement>(
      '[data-testid="diff-view"]'
    )
    expect(diff?.dataset.old).toBe("")
    expect(diff?.dataset.new).toBe("# New draft\n")
    expect(container.textContent).toContain(
      "Current version head-2 → working file"
    )
  })

  it("loads table and row changes for a modified Base file", async () => {
    mocks.status = {
      enabled: true,
      clean: false,
      hasConflicts: false,
      branch: "main",
      head: { id: "head-2" },
      changes: [{ path: "tasks.base", status: "modified", unstaged: true }],
    }
    const path = {
      path: "tasks.base",
      change: "modified",
      kind: "sqlite_database",
      storage: "sqlite_snapshot",
    }
    mocks.getDiff
      .mockResolvedValueOnce({
        currentHead: "head-2",
        currentBranch: "main",
        from: "head-2",
        to: "worktree",
        paths: [path],
        content: null,
        sqliteFiles: [],
      })
      .mockResolvedValueOnce({
        currentHead: "head-2",
        currentBranch: "main",
        from: "head-2",
        to: "worktree",
        paths: [path],
        content: null,
        sqliteFiles: [
          {
            ...path,
            rowDiffAvailable: true,
            logicalStatus: "logical_changes",
            capabilities: ["rowid_table_rows"],
            limitations: [],
            message: null,
            tables: [
              {
                name: "tb_tasks",
                columns: ["_id", "title"],
                changes: [
                  {
                    operation: "insert",
                    rowId: 2,
                    values: ["2", "Second task"],
                    beforeValues: null,
                  },
                ],
              },
            ],
            opaqueChanges: [],
          },
        ],
      })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/version/diff?path=tasks.base"]}>
          <SpaceVersionDiffPage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    expect(mocks.getDiff).toHaveBeenNthCalledWith(1, {
      from: "head-2",
      path: "tasks.base",
    })
    expect(mocks.getDiff).toHaveBeenNthCalledWith(2, {
      from: "head-2",
      path: "tasks.base",
      includeRows: true,
    })
    expect(container.textContent).toContain("1 changed table")
    expect(container.textContent).toContain("Second task")
  })

  it("disables Open file when the working file was deleted", async () => {
    mocks.status = {
      enabled: true,
      clean: false,
      hasConflicts: false,
      branch: "main",
      head: { id: "head-2" },
      changes: [{ path: "gone.md", status: "deleted", unstaged: true }],
    }
    mocks.getDiff.mockResolvedValue({
      currentHead: "head-2",
      currentBranch: "main",
      from: "head-2",
      to: "worktree",
      paths: [
        {
          path: "gone.md",
          change: "deleted",
          kind: "text_file",
          storage: "inline",
        },
      ],
      content: {
        path: "gone.md",
        change: "deleted",
        kind: "text_file",
        storage: "inline",
        before: {
          state: "utf8",
          content: "gone",
          size: 4,
          contentHash: "before",
        },
        after: { state: "absent" },
      },
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/version/diff?path=gone.md"]}>
          <SpaceVersionDiffPage />
        </MemoryRouter>
      )
      await flushEffects()
    })

    const open = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Open file")
    )
    expect(open?.disabled).toBe(true)
    expect(open?.title).toBe("Deleted files cannot be opened")
  })
})
