// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type {
  EidosLiteApi,
  SpaceSnapshot,
  SpaceVersionDiff,
  SpaceVersionTableDiff,
} from "../shared/contracts"
import {
  buildVersionChangeTreeModel,
  type VersionInspection,
} from "./version-change-tree"
import {
  TableDiff,
  VersionDiffPreview,
  VersionPanel,
  versionRowDiffPage,
} from "./version-panel"

const customersTable: SpaceVersionTableDiff = {
  name: "Customers",
  columns: ["name", "status"],
  primaryKeyColumns: ["name"],
  changes: [
    {
      op: "insert",
      key: { name: "Hao Chen" },
      values: ["Hao Chen", "Lead"],
    },
    {
      op: "update",
      key: { name: "Mei Lin" },
      oldValues: ["Mei Lin", "Lead"],
      values: ["Mei Lin", "Customer"],
    },
  ],
}

const versionDiff: SpaceVersionDiff = {
  currentHead: "head-2",
  currentBranch: null,
  from: "head-1",
  to: "worktree",
  paths: [
    { path: "notes/readme.md", change: "added", kind: "text_file" },
    {
      path: "data/crm.eidos",
      change: "modified",
      kind: "sqlite_database",
    },
  ],
  files: [
    {
      path: "data/crm.eidos",
      change: "modified",
      kind: "sqlite_database",
      rowDiffAvailable: true,
      limitations: [],
      tables: [customersTable],
    },
  ],
}

const unversionedSpace: SpaceSnapshot = {
  id: "space-1",
  name: "Project",
  displayPath: "/Project",
  entries: [],
  eidosFileCount: 0,
  operation: { phase: "ready", recoverable: false },
  graft: {
    available: true,
    backend: "sdk",
    expectedVersion: "0.3.0",
    initialized: false,
  },
  invalidatedSessionIds: [],
}

describe("VersionPanel row diff paging", () => {
  it("keeps version setup inside the panel instead of the titlebar", () => {
    const markup = renderToStaticMarkup(
      createElement(VersionPanel, {
        space: unversionedSpace,
        refreshKey: 0,
        onClose: () => undefined,
        onSpaceChange: () => undefined,
        onFilesMaterialized: () => undefined,
        onRefresh: () => undefined,
        onInspectionChange: () => undefined,
      })
    )

    expect(markup).toContain('data-version-initialized="false"')
    expect(markup).toContain("Start local version history")
    expect(markup).toContain("data-enable-versioning")
    expect(markup).not.toContain('role="tab"')
  })

  it("keeps a 10k-row diff bounded while retaining every page", () => {
    const changes = Array.from({ length: 10_126 }, (_, index) => index)

    expect(versionRowDiffPage(changes, 0)).toMatchObject({
      page: 0,
      pageCount: 102,
      start: 0,
      end: 100,
      total: 10_126,
      items: Array.from({ length: 100 }, (_, index) => index),
    })
    expect(versionRowDiffPage(changes, 101)).toMatchObject({
      page: 101,
      pageCount: 102,
      start: 10_100,
      end: 10_126,
      total: 10_126,
      items: Array.from({ length: 26 }, (_, index) => 10_100 + index),
    })
    expect(versionRowDiffPage(changes, 999)).toMatchObject({
      page: 101,
      start: 10_100,
      end: 10_126,
    })
  })

  it("mounts only the first bounded page for a 10k-row table diff", () => {
    const table: SpaceVersionTableDiff = {
      name: "Elden Ring messages",
      columns: ["msg"],
      primaryKeyColumns: ["_id"],
      changes: Array.from({ length: 10_126 }, (_, index) => ({
        op: "insert",
        key: { _id: String(index + 1) },
        values: [`Message ${index + 1}`],
      })),
    }

    const markup = renderToStaticMarkup(createElement(TableDiff, { table }))

    expect(markup.match(/class="row-diff"/g)).toHaveLength(100)
    expect(markup).toContain("1–100 of 10,126")
    expect(markup).toContain('aria-label="Next row changes"')
  })

  it("models Eidos Files as expandable tree nodes with changed tables", () => {
    const model = buildVersionChangeTreeModel(versionDiff)

    expect(model.paths).toEqual([
      "notes/readme.md",
      "data/crm.eidos/",
      "data/crm.eidos/Customers",
    ])
    expect(model.initialExpandedPaths).toEqual(["notes/", "data/"])
    expect(model.gitStatus).toEqual([
      { path: "notes/readme.md", status: "added" },
      { path: "data/crm.eidos/", status: "modified" },
    ])
    expect(model.decorationByPath.get("data/crm.eidos/")).toBe("1 table")
    expect(model.decorationByPath.get("data/crm.eidos/Customers")).toBe("+1 ~1")
    expect(
      model.targetByTreePath.get("data/crm.eidos/Customers")?.table?.name
    ).toBe("Customers")
  })

  it("renders a selected table diff in the main review surface", () => {
    const file = versionDiff.files[0]!
    const inspection: VersionInspection = {
      type: "table",
      key: "data/crm.eidos/Customers",
      mode: "changes",
      diff: versionDiff,
      change: versionDiff.paths[1]!,
      file,
      table: customersTable,
      commit: null,
    }

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        onClose: () => undefined,
      })
    )

    expect(markup).toContain('data-version-inspector="table"')
    expect(markup).toContain("Customers")
    expect(markup).toContain("+1 rows")
    expect(markup).toContain("~1 rows")
    expect(markup.match(/class="row-diff"/g)).toHaveLength(2)
    expect(markup).toContain("Hao Chen")
    expect(markup).toContain("Customer")
  })

  it("loads text content only after selecting a historical text file", () => {
    const inspection: VersionInspection = {
      type: "file",
      key: "history:commit-2:notes/readme.md",
      mode: "history",
      diff: versionDiff,
      change: versionDiff.paths[0]!,
      file: null,
      commit: {
        id: "a".repeat(64),
        parent: "b".repeat(64),
        message: "Update notes",
        timestampMs: 1_700_000_000_000,
        files: 1,
        changes: [versionDiff.paths[0]!],
        tables: [],
        changedTables: 0,
      },
    }

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        onClose: () => undefined,
      })
    )

    expect(markup).toContain("Reading checkpoint text…")
    expect(markup).not.toContain("metadata only")
  })

  it("loads text content after selecting a working tree text change", () => {
    const inspection: VersionInspection = {
      type: "file",
      key: "notes/readme.md",
      mode: "changes",
      diff: versionDiff,
      change: versionDiff.paths[0]!,
      file: null,
      commit: null,
    }

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        onClose: () => undefined,
      })
    )

    expect(markup).toContain("Reading local text…")
    expect(markup).not.toContain("metadata only")
  })

  it("refreshes open Eidos Files after restoring a Space checkpoint", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root: Root = createRoot(host)
    const selectedCommit = {
      id: "a".repeat(64),
      parent: "b".repeat(64),
      message: "Initial checkpoint",
      timestampMs: 1_700_000_000_000,
      files: 1,
      changes: versionDiff.paths,
      tables: [],
      changedTables: 1,
    }
    const currentHead = "c".repeat(64)
    const restoredSpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        clean: true,
        currentHead: "d".repeat(64),
      },
    }
    const restoreCheckpoint = vi.fn().mockResolvedValue(restoredSpace)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory: vi.fn().mockResolvedValue({
          currentHead,
          currentBranch: null,
          commits: [selectedCommit],
          hasMore: false,
        }),
        getVersionDiff: vi.fn().mockResolvedValue(versionDiff),
        restoreCheckpoint,
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })
    const onSpaceChange = vi.fn()
    const onFilesMaterialized = vi.fn().mockResolvedValue(undefined)
    const onRefresh = vi.fn()

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          space: restoredSpace,
          refreshKey: 0,
          onClose: () => undefined,
          onSpaceChange,
          onFilesMaterialized,
          onRefresh,
          onInspectionChange: () => undefined,
        })
      )
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(".commit-row")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(".restore-action")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(".restore-confirm .danger-action")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(restoreCheckpoint).toHaveBeenCalledWith(
      selectedCommit.id,
      currentHead
    )
    expect(onSpaceChange).toHaveBeenCalledWith(restoredSpace)
    expect(onFilesMaterialized).toHaveBeenCalledWith(restoredSpace)
    expect(onRefresh).toHaveBeenCalledOnce()

    await act(async () => root.unmount())
    host.remove()
  })

  it("shows Changes when a pending version check resolves dirty", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root: Root = createRoot(host)
    const checkingSpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        checking: true,
      },
    }
    const dirtySpace: SpaceSnapshot = {
      ...checkingSpace,
      graft: {
        ...checkingSpace.graft,
        checking: false,
        clean: false,
        changedPaths: 1,
        currentHead: "a".repeat(64),
      },
    }
    const cleanSpace: SpaceSnapshot = {
      ...dirtySpace,
      graft: {
        ...dirtySpace.graft,
        clean: true,
        changedPaths: 0,
      },
    }
    const getVersionChanges = vi.fn().mockResolvedValue(versionDiff)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory: vi.fn().mockResolvedValue({
          currentHead: dirtySpace.graft.currentHead ?? null,
          currentBranch: null,
          commits: [],
          hasMore: false,
        }),
        getVersionChanges,
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })
    const panelProps = {
      refreshKey: 0,
      onClose: () => undefined,
      onSpaceChange: () => undefined,
      onFilesMaterialized: () => undefined,
      onRefresh: () => undefined,
      onInspectionChange: () => undefined,
    }

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          ...panelProps,
          space: checkingSpace,
        })
      )
    })
    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          ...panelProps,
          space: dirtySpace,
        })
      )
    })

    expect(
      host
        .querySelector<HTMLButtonElement>('[role="tab"]')
        ?.getAttribute("aria-selected")
    ).toBe("true")
    expect(getVersionChanges).toHaveBeenCalled()

    await act(async () => {
      host
        .querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          ...panelProps,
          space: cleanSpace,
        })
      )
    })
    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          ...panelProps,
          space: dirtySpace,
        })
      )
    })

    expect(
      host
        .querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]
        ?.getAttribute("aria-selected")
    ).toBe("true")

    await act(async () => root.unmount())
    host.remove()
  })

  it("uses loaded Changes when a cached Space summary is still clean", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root: Root = createRoot(host)
    const staleCleanSpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        clean: true,
        changedPaths: 0,
        currentHead: "a".repeat(64),
      },
    }
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory: vi.fn().mockResolvedValue({
          currentHead: staleCleanSpace.graft.currentHead ?? null,
          currentBranch: null,
          commits: [],
          hasMore: false,
        }),
        getVersionChanges: vi.fn().mockResolvedValue(versionDiff),
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          space: staleCleanSpace,
          refreshKey: 0,
          onClose: () => undefined,
          onSpaceChange: () => undefined,
          onFilesMaterialized: () => undefined,
          onRefresh: () => undefined,
          onInspectionChange: () => undefined,
        })
      )
    })
    await act(async () => {
      host
        .querySelectorAll<HTMLButtonElement>('[role="tab"]')[0]
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(host.querySelector(".version-summary strong")?.textContent).toBe(
      "2 changed files · 2 loaded row changes"
    )
    expect(host.textContent).not.toContain("No local changes")
    expect(host.querySelector(".checkpoint-form")).not.toBeNull()

    await act(async () => root.unmount())
    host.remove()
  })
})
