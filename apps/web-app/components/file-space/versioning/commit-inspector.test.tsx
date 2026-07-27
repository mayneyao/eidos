import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import type {
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionDiffRequest,
  SpaceVersionStatus,
} from "@/apps/web-app/hooks/use-space-versioning"

import { CommitInspector } from "./commit-inspector"

vi.mock("@/components/table/diff-view", () => ({
  DiffView: ({
    oldContent,
    newContent,
    filename,
  }: {
    oldContent: string
    newContent: string
    filename: string
  }) => (
    <div data-testid="mock-diff-view">
      {filename}:{oldContent}→{newContent}
    </div>
  ),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const commit: SpaceVersionCommit = {
  id: "commit-2",
  message: "Update notes",
  timestamp: 1_720_000_000_000,
  parents: ["commit-1"],
  labels: [],
  changedPaths: [
    { path: "notes/a.md", status: "modified" },
    { path: "notes/b.md", status: "added" },
  ],
}

const diff: SpaceVersionDiff = {
  currentHead: "commit-2",
  currentBranch: "main",
  from: "commit-1",
  to: "commit-2",
  paths: [
    {
      path: "notes/a.md",
      change: "modified",
      kind: "text_file",
      storage: "inline",
    },
    {
      path: "notes/b.md",
      change: "added",
      kind: "text_file",
      storage: "inline",
    },
  ],
  content: null,
  sqliteFiles: [],
}

function createGetDiff(eidosFileDiff: SpaceVersionDiff = diff) {
  return vi.fn(
    async (request: SpaceVersionDiffRequest): Promise<SpaceVersionDiff> => {
      if (!request.includeContent || !request.path) return eidosFileDiff
      const metadata = eidosFileDiff.paths.find(
        (entry) => entry.path === request.path
      )
      if (!metadata || metadata.kind !== "text_file") return eidosFileDiff
      return {
        ...eidosFileDiff,
        paths: [metadata],
        content: {
          path: request.path,
          change: metadata.change,
          kind: "text_file",
          storage: metadata.storage,
          before:
            metadata.change === "added"
              ? { state: "absent" }
              : {
                  state: "utf8",
                  content: "before\n",
                  size: 7,
                  contentHash: "hash-before",
                },
          after:
            metadata.change === "deleted"
              ? { state: "absent" }
              : {
                  state: "utf8",
                  content: "after\n",
                  size: 6,
                  contentHash: "hash-after",
                },
        },
      }
    }
  )
}

async function flushEffects() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const status: SpaceVersionStatus = {
  enabled: true,
  clean: true,
  hasConflicts: false,
  branch: "main",
  mergeHead: null,
  remoteNames: [],
  upstream: null,
  ahead: 0,
  behind: 0,
  head: {
    id: "commit-3",
    message: "Current version",
    timestamp: 1_720_000_100_000,
    parents: ["commit-2"],
    labels: [],
    changedPaths: [],
  },
  changes: [],
}

describe("CommitInspector", () => {
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

  it("loads metadata once and lazily requests selected text content", async () => {
    const getCommit = vi.fn(async () => commit)
    const getDiff = createGetDiff()
    const restorePath = vi.fn()
    const restoreVersion = vi.fn()

    await act(async () => {
      root.render(
        <CommitInspector
          commit={commit}
          getCommit={getCommit}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={restorePath}
          restoreVersion={restoreVersion}
        />
      )
      await flushEffects()
    })

    expect(getCommit).toHaveBeenCalledOnce()
    expect(getDiff).toHaveBeenCalledTimes(2)
    expect(getDiff).toHaveBeenNthCalledWith(1, {
      from: "commit-1",
      to: "commit-2",
    })
    expect(getDiff).toHaveBeenNthCalledWith(2, {
      from: "commit-1",
      to: "commit-2",
      path: "notes/a.md",
      includeContent: true,
    })
    expect(
      container.querySelector('[data-testid="mock-diff-view"]')?.textContent
    ).toContain("before")
    const changedPathsPane = container.querySelector(
      '[data-testid="commit-changed-paths-pane"]'
    )
    expect(
      changedPathsPane?.parentElement?.getAttribute(
        "data-panel-group-direction"
      )
    ).toBe("horizontal")
    expect(
      container
        .querySelector('[data-testid="commit-inspector-resize-handle"]')
        ?.getAttribute("aria-label")
    ).toBe("Resize changed paths and change details")

    const secondPath = [...container.querySelectorAll("button")].find(
      (button) => button.title === "notes/b.md"
    )
    await act(async () => {
      secondPath?.click()
      await flushEffects()
    })

    expect(getDiff).toHaveBeenCalledTimes(3)
    expect(getDiff).toHaveBeenLastCalledWith({
      from: "commit-1",
      to: "commit-2",
      path: "notes/b.md",
      includeContent: true,
    })
    expect(container.textContent).toContain("Added")
    expect(container.textContent).toContain("notes/b.md")

    await act(async () => {
      root.render(
        <CommitInspector
          commit={commit}
          getCommit={getCommit}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={restorePath}
          restoreVersion={restoreVersion}
          placement="below"
        />
      )
      await Promise.resolve()
    })
    expect(
      container
        .querySelector('[data-testid="commit-changed-paths-pane"]')
        ?.parentElement?.getAttribute("data-panel-group-direction")
    ).toBe("vertical")
    expect(
      container
        .querySelector('[data-testid="commit-inspector-resize-handle"]')
        ?.getAttribute("aria-label")
    ).toBe("Resize changed paths and change details vertically")
  })

  it("shows file details and content for the first version", async () => {
    const firstCommit: SpaceVersionCommit = {
      ...commit,
      id: "commit-1",
      message: "Initial version",
      parents: [],
      changedPaths: [{ path: "README.md", status: "added" }],
    }
    const rootDiff: SpaceVersionDiff = {
      currentHead: "commit-3",
      currentBranch: "main",
      from: "root",
      to: "commit-1",
      paths: [
        {
          path: "README.md",
          change: "added",
          kind: "text_file",
          storage: "inline",
        },
      ],
      content: null,
      sqliteFiles: [],
    }
    const getDiff = vi.fn(
      async (request: SpaceVersionDiffRequest): Promise<SpaceVersionDiff> =>
        request.includeContent
          ? {
              ...rootDiff,
              content: {
                path: "README.md",
                change: "added",
                kind: "text_file",
                storage: "inline",
                before: { state: "absent" },
                after: {
                  state: "utf8",
                  content: "# First\n",
                  size: 8,
                  contentHash: "hash-first",
                },
              },
            }
          : rootDiff
    )

    await act(async () => {
      root.render(
        <CommitInspector
          commit={firstCommit}
          getCommit={vi.fn(async () => firstCommit)}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={vi.fn()}
          restoreVersion={vi.fn()}
        />
      )
      await flushEffects()
    })

    expect(getDiff).toHaveBeenNthCalledWith(1, { root: "commit-1" })
    expect(getDiff).toHaveBeenNthCalledWith(2, {
      root: "commit-1",
      path: "README.md",
      includeContent: true,
    })
    expect(container.textContent).toContain("README.md")
    expect(
      container.querySelector('[data-testid="mock-diff-view"]')?.textContent
    ).toContain("# First")
    expect(container.textContent).not.toContain("no earlier version")
  })

  it("restores the selected path after an explicit non-committing confirmation", async () => {
    const getCommit = vi.fn(async () => commit)
    const getDiff = createGetDiff()
    const restorePath = vi.fn(async () => ({
      revision: "commit-2",
      path: "notes/a.md",
      kind: "text_file" as const,
      storage: "inline" as const,
      effect: "modified" as const,
      status: {
        ...status,
        clean: false,
        changes: [{ path: "notes/a.md", status: "modified" as const }],
      },
    }))
    const restoreVersion = vi.fn()

    await act(async () => {
      root.render(
        <CommitInspector
          commit={commit}
          getCommit={getCommit}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={restorePath}
          restoreVersion={restoreVersion}
        />
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const restoreButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Restore notes/a.md from this version"]'
    )
    await act(async () => {
      restoreButton?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.textContent).toContain("HEAD will not move")
    expect(document.body.textContent).toContain("no version will be created")

    const confirmButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Restore file")
    )
    await act(async () => {
      confirmButton?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(restorePath).toHaveBeenCalledWith({
      revision: "commit-2",
      path: "notes/a.md",
      expectedHead: "commit-3",
      overwriteChanges: true,
      allowDelete: false,
    })
    expect(container.textContent).toContain(
      "Review it in Changes before creating a version"
    )
  })

  it("restores every versioned path without moving history", async () => {
    const getCommit = vi.fn(async () => commit)
    const getDiff = createGetDiff()
    const restoreVersion = vi.fn(async () => ({
      revision: "commit-2",
      restoredPaths: ["notes/a.md", "notes/b.md"],
      status,
    }))

    await act(async () => {
      root.render(
        <CommitInspector
          commit={commit}
          getCommit={getCommit}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={vi.fn()}
          restoreVersion={restoreVersion}
        />
      )
      await flushEffects()
    })

    const openButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Restore Space"
    )
    await act(async () => {
      openButton?.click()
      await flushEffects()
    })
    expect(document.body.textContent).toContain("history will not be rewritten")
    expect(document.body.textContent).toContain("Untracked and ignored files")

    const confirmButton = [...document.querySelectorAll("button")].find(
      (button) =>
        button.textContent?.trim() === "Restore Space" &&
        button.closest('[role="alertdialog"]')
    )
    await act(async () => {
      confirmButton?.click()
      await flushEffects()
    })

    expect(restoreVersion).toHaveBeenCalledWith({
      revision: "commit-2",
      expectedHead: "commit-3",
      overwriteChanges: true,
    })
    expect(container.textContent).toContain("Restored 2 versioned paths")
    expect(container.textContent).toContain(
      "The Space now matches the current version"
    )
  })

  it("keeps disabled restore controls focusable and exposes their reason", async () => {
    const conflictedStatus: SpaceVersionStatus = {
      ...status,
      clean: false,
      hasConflicts: true,
      changes: [
        {
          path: "notes/a.md",
          status: "modified",
          conflicted: true,
        },
      ],
    }

    await act(async () => {
      root.render(
        <CommitInspector
          commit={commit}
          getCommit={vi.fn(async () => commit)}
          getDiff={createGetDiff()}
          status={conflictedStatus}
          operation={null}
          restorePath={vi.fn()}
          restoreVersion={vi.fn()}
        />
      )
      await flushEffects()
    })

    const fileRestore = container.querySelector<HTMLButtonElement>(
      '[aria-label="Restore notes/a.md from this version"]'
    )
    const reasonId = fileRestore?.getAttribute("aria-describedby")
    expect(fileRestore?.disabled).toBe(false)
    expect(fileRestore?.getAttribute("aria-disabled")).toBe("true")
    expect(reasonId).toBeTruthy()
    expect(document.getElementById(reasonId!)?.textContent).toContain(
      "Resolve version conflicts"
    )

    await act(async () => {
      fileRestore?.click()
      await flushEffects()
    })
    expect(document.body.textContent).not.toContain("HEAD will not move")
  })

  it("explains when historical text is outside the bounded preview", async () => {
    const getCommit = vi.fn(async () => commit)
    const getDiff = vi.fn(
      async (request: SpaceVersionDiffRequest): Promise<SpaceVersionDiff> =>
        request.includeContent
          ? {
              ...diff,
              paths: [diff.paths[0]],
              content: {
                path: "notes/a.md",
                change: "modified",
                kind: "text_file",
                storage: "inline",
                before: {
                  state: "too_large",
                  size: 2 * 1024 * 1024,
                  contentHash: "hash-before",
                },
                after: {
                  state: "utf8",
                  content: "after\n",
                  size: 6,
                  contentHash: "hash-after",
                },
              },
            }
          : diff
    )

    await act(async () => {
      root.render(
        <CommitInspector
          commit={commit}
          getCommit={getCommit}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={vi.fn()}
          restoreVersion={vi.fn()}
        />
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("limited to 1 MB per side")
    expect(container.textContent).toContain("2.0 MB")
  })

  it("loads Eidos File table details only after a SQLite path is selected", async () => {
    const baseCommit: SpaceVersionCommit = {
      ...commit,
      message: "Update tasks",
      changedPaths: [{ path: "tasks.eidos", status: "modified" }],
    }
    const path = {
      path: "tasks.eidos",
      change: "modified" as const,
      kind: "sqlite_database" as const,
      storage: "sqlite_snapshot" as const,
    }
    const metadata: SpaceVersionDiff = {
      ...diff,
      paths: [path],
      sqliteFiles: [],
    }
    const getDiff = vi.fn(
      async (request: SpaceVersionDiffRequest): Promise<SpaceVersionDiff> =>
        request.includeRows
          ? {
              ...metadata,
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
                      primaryKeyColumns: [],
                      changes: [
                        {
                          operation: "insert",
                          rowId: 2,
                          values: ["2", "Plan migration"],
                          beforeValues: null,
                        },
                      ],
                    },
                  ],
                  opaqueChanges: [],
                },
              ],
            }
          : metadata
    )

    await act(async () => {
      root.render(
        <CommitInspector
          commit={baseCommit}
          getCommit={vi.fn(async () => baseCommit)}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={vi.fn()}
          restoreVersion={vi.fn()}
        />
      )
      await flushEffects()
    })

    expect(getDiff).toHaveBeenNthCalledWith(1, {
      from: "commit-1",
      to: "commit-2",
    })
    expect(getDiff).toHaveBeenNthCalledWith(2, {
      from: "commit-1",
      to: "commit-2",
      path: "tasks.eidos",
      includeRows: true,
    })
    expect(container.textContent).toContain("1 changed table")
    expect(container.textContent).toContain("Plan migration")
  })

  it("uses a destructive confirmation when restoring a deleted state", async () => {
    const deletedCommit: SpaceVersionCommit = {
      ...commit,
      id: "delete-2",
      message: "Remove old note",
      changedPaths: [{ path: "notes/gone.md", status: "deleted" }],
    }
    const getCommit = vi.fn(async () => deletedCommit)
    const deletedDiff: SpaceVersionDiff = {
      ...diff,
      to: "delete-2",
      paths: [
        {
          path: "notes/gone.md",
          change: "deleted" as const,
          kind: "text_file" as const,
          storage: "inline" as const,
        },
      ],
      content: null,
    }
    const getDiff = createGetDiff(deletedDiff)
    const restorePath = vi.fn(async () => ({
      revision: "delete-2",
      path: "notes/gone.md",
      kind: "text_file" as const,
      storage: "inline" as const,
      effect: "deleted" as const,
      status,
    }))
    const restoreVersion = vi.fn()

    await act(async () => {
      root.render(
        <CommitInspector
          commit={deletedCommit}
          getCommit={getCommit}
          getDiff={getDiff}
          status={status}
          operation={null}
          restorePath={restorePath}
          restoreVersion={restoreVersion}
        />
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Restore notes/gone.md from this version"]'
        )
        ?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.textContent).toContain("will delete the working file")

    const deleteButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Delete working file")
    )
    await act(async () => {
      deleteButton?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(restorePath).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: "delete-2",
        path: "notes/gone.md",
        allowDelete: true,
      })
    )
  })
})
