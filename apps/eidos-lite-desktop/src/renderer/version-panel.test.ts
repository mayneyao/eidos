// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"

import type {
  EidosLiteApi,
  SpaceSnapshot,
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionTableDiff,
} from "../shared/contracts"
import {
  buildVersionChangeTreeModel,
  type VersionInspection,
  versionChangeDiscardTarget,
  versionChangeTreeStructureKey,
} from "./version-change-tree"
import {
  clearVersionPathDiffCacheForTests,
  historySyncPresentation,
  isVersionReadAbortError,
  loadHistoricalVersionPathDiff,
  loadVersionPathDiff,
  mergeVersionDiffPages,
  TableDiff,
  VersionDiffPreview,
  VersionPanel,
  withCommitTableSummaries,
} from "./version-panel"
import { VersionTextDiffContent } from "./version-text-diff"

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
  changeToken: "working-tree-2",
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
    expectedVersion: "0.3.1",
    initialized: false,
  },
  invalidatedSessionIds: [],
}

describe("VersionPanel table diff", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("falls back to the other merge parent when the first-parent SQLite diff is physical only", async () => {
    const path = "dev/eidos-project.eidos"
    const firstParent = "a".repeat(64)
    const otherParent = "b".repeat(64)
    const commit: SpaceVersionCommit = {
      id: "c".repeat(64),
      parent: firstParent,
      parents: [firstParent, otherParent],
      message: "Merge Hosted changes",
      timestampMs: 1_700_000_000_000,
      files: 1,
      changes: [],
      tables: [],
      changedTables: 0,
    }
    const physicalOnly: SpaceVersionDiff = {
      currentHead: commit.id,
      currentBranch: "main",
      from: firstParent,
      to: commit.id,
      paths: [{ path, change: "modified", kind: "sqlite_database" }],
      files: [
        {
          path,
          change: "modified",
          kind: "sqlite_database",
          rowDiffAvailable: true,
          logicalStatus: "file_changed_no_supported_logical_changes",
          limitations: [],
          schemaChanges: [],
          tables: [],
        },
      ],
    }
    const logicalChanges: SpaceVersionDiff = {
      ...physicalOnly,
      from: otherParent,
      files: [
        {
          ...physicalOnly.files[0]!,
          logicalStatus: "logical_changes",
          tables: [customersTable],
        },
      ],
    }
    const load = vi.fn(async (parent: string | null) =>
      parent === firstParent ? physicalOnly : logicalChanges
    )

    await expect(
      loadHistoricalVersionPathDiff(path, commit, firstParent, load)
    ).resolves.toBe(logicalChanges)
    expect(load.mock.calls.map(([parent]) => parent)).toEqual([
      firstParent,
      otherParent,
    ])
  })

  it("explains an alternate merge-parent comparison in the file detail", () => {
    const firstParent = "a".repeat(64)
    const otherParent = "b".repeat(64)
    const commit: SpaceVersionCommit = {
      id: "c".repeat(64),
      parent: firstParent,
      parents: [firstParent, otherParent],
      message: "Merge Hosted changes",
      timestampMs: 1_700_000_000_000,
      files: 1,
      changes: [],
      tables: [],
      changedTables: 0,
    }
    const inspection: VersionInspection = {
      type: "file",
      key: "history:merge:data/crm.eidos",
      mode: "history",
      diff: { ...versionDiff, from: otherParent, to: commit.id },
      change: versionDiff.paths[1]!,
      file: versionDiff.files[0]!,
      commit,
    }

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        theme: "light",
        onClose: () => undefined,
      })
    )

    expect(markup).toContain("matches its local parent")
    expect(markup).toContain("compared with the other merge parent")
  })

  it("describes physical-only SQLite history without calling it a first version", () => {
    const inspection: VersionInspection = {
      type: "file",
      key: "history:physical-only:data/crm.eidos",
      mode: "history",
      diff: versionDiff,
      change: versionDiff.paths[1]!,
      file: {
        ...versionDiff.files[0]!,
        logicalStatus: "file_changed_no_supported_logical_changes",
        tables: [],
      },
      commit: {
        id: "c".repeat(64),
        parent: "a".repeat(64),
        message: "Merge Hosted changes",
        timestampMs: 1_700_000_000_000,
        files: 1,
        changes: [],
        tables: [],
        changedTables: 0,
      },
    }

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        theme: "light",
        onClose: () => undefined,
      })
    )

    expect(markup).toContain("No supported logical changes")
    expect(markup).toContain("supported schema and rows match")
    expect(markup).not.toContain("first version")
  })

  it("keeps the working change identity when table details omit it", () => {
    const detail: SpaceVersionDiff = {
      ...versionDiff,
      changeToken: undefined,
      files: [versionDiff.files[0]!],
    }

    expect(mergeVersionDiffPages(versionDiff, detail)).toMatchObject({
      currentHead: versionDiff.currentHead,
      changeToken: versionDiff.changeToken,
    })
  })

  it("offers discard only for changed files and their containing folders", () => {
    expect(versionChangeDiscardTarget(versionDiff, "notes/readme.md")).toEqual({
      kind: "file",
      path: "notes/readme.md",
      fileCount: 1,
    })
    expect(versionChangeDiscardTarget(versionDiff, "notes/")).toEqual({
      kind: "folder",
      path: "notes",
      fileCount: 1,
    })
    expect(
      versionChangeDiscardTarget(versionDiff, "data/crm.eidos/Customers")
    ).toBeNull()
    expect(versionChangeDiscardTarget(versionDiff, "data/crm.eidos/")).toEqual({
      kind: "file",
      path: "data/crm.eidos",
      fileCount: 1,
    })
  })

  it("describes the cached cloud relationship in user-facing terms", () => {
    expect(
      historySyncPresentation({
        state: "ahead",
        remoteHead: "cloud-head",
        ahead: 2,
        behind: 0,
        checkedAtMs: new Date("2026-08-01T04:00:00.000Z").getTime(),
      })
    ).toMatchObject({
      tone: "ahead",
      title: "2 local saved versions waiting to upload",
    })
    expect(
      historySyncPresentation({
        state: "behind",
        ahead: 0,
        behind: 1,
      })
    ).toMatchObject({
      tone: "behind",
      title: "Cloud has 1 newer saved version",
      detail: expect.stringContaining("Open Sync"),
    })
  })

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
    expect(markup).toContain("Start local versions")
    expect(markup).toContain("data-enable-versioning")
    expect(markup).not.toContain('role="tab"')
  })

  it("keeps cached Changes visible during a background status refresh", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionChanges: vi.fn().mockResolvedValue(versionDiff),
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          space: {
            ...unversionedSpace,
            graft: {
              ...unversionedSpace.graft,
              initialized: true,
              checking: true,
              clean: false,
              currentHead: "a".repeat(64),
              changeToken: "cached-token",
            },
          },
          refreshKey: 0,
          onClose: () => undefined,
          onSpaceChange: () => undefined,
          onFilesMaterialized: () => undefined,
          onRefresh: () => undefined,
          onInspectionChange: () => undefined,
        })
      )
      await Promise.resolve()
    })

    expect(host.textContent).not.toContain("Checking local history…")
    expect(
      host.querySelector('[aria-label="Refreshing local changes"]')
    ).not.toBeNull()
    expect(host.textContent).toContain("Changes")

    await act(async () => root.unmount())
    host.remove()
  })

  it("shows initialized history while the first status refresh is pending", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const getVersionHistory = vi.fn().mockResolvedValue({
      currentHead: null,
      currentBranch: null,
      commits: [],
      hasMore: false,
    })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory,
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          space: {
            ...unversionedSpace,
            graft: {
              ...unversionedSpace.graft,
              initialized: true,
              checking: true,
            },
          },
          refreshKey: 0,
          onClose: () => undefined,
          onSpaceChange: () => undefined,
          onFilesMaterialized: () => undefined,
          onRefresh: () => undefined,
          onInspectionChange: () => undefined,
        })
      )
      await Promise.resolve()
    })

    expect(host.textContent).not.toContain("Checking local history…")
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2)
    expect(getVersionHistory).toHaveBeenCalledOnce()

    await act(async () => root.unmount())
    host.remove()
  })

  it("marks the latest cloud checkpoint without another network read", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const localHead = "a".repeat(64)
    const remoteHead = "b".repeat(64)
    const getVersionHistory = vi.fn().mockResolvedValue({
      currentHead: localHead,
      currentBranch: "main",
      commits: [
        {
          id: localHead,
          parent: remoteHead,
          message: "Local edit",
          timestampMs: new Date("2026-08-01T05:00:00.000Z").getTime(),
          files: 1,
          changes: [],
          tables: [],
          changedTables: 0,
        },
        {
          id: remoteHead,
          parent: null,
          message: "Cloud baseline",
          timestampMs: new Date("2026-08-01T04:00:00.000Z").getTime(),
          files: 1,
          changes: [],
          tables: [],
          changedTables: 0,
        },
      ] satisfies SpaceVersionCommit[],
      hasMore: false,
    })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory,
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          space: {
            ...unversionedSpace,
            graft: {
              ...unversionedSpace.graft,
              initialized: true,
              clean: true,
              currentHead: localHead,
              sync: {
                state: "ahead",
                remoteHead,
                ahead: 1,
                behind: 0,
                checkedAtMs: new Date("2026-08-01T04:30:00.000Z").getTime(),
              },
            },
          },
          refreshKey: 0,
          onClose: () => undefined,
          onSpaceChange: () => undefined,
          onFilesMaterialized: () => undefined,
          onRefresh: () => undefined,
          onInspectionChange: () => undefined,
        })
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getVersionHistory).toHaveBeenCalledOnce()
    expect(
      host.querySelector('[data-history-sync-state="ahead"]')?.textContent
    ).toContain("1 local saved version waiting to upload")
    expect(host.querySelector("[data-history-cloud-boundary]")).not.toBeNull()
    expect(
      host.querySelector('[data-cloud-checkpoint="true"]')?.textContent
    ).toContain("Cloud")

    await act(async () => root.unmount())
    host.remove()
  })

  it("does not restart an initial History read when status resolves to the same head", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const head = "a".repeat(64)
    let finishHistory:
      | ((history: {
          currentHead: string | null
          currentBranch: string | null
          commits: SpaceVersionCommit[]
          hasMore: boolean
        }) => void)
      | null = null
    const getVersionHistory = vi.fn(
      () =>
        new Promise<{
          currentHead: string | null
          currentBranch: string | null
          commits: SpaceVersionCommit[]
          hasMore: boolean
        }>((resolve) => {
          finishHistory = resolve
        })
    )
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory,
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })
    const props = {
      refreshKey: 0,
      onClose: () => undefined,
      onSpaceChange: () => undefined,
      onFilesMaterialized: () => undefined,
      onRefresh: () => undefined,
      onInspectionChange: () => undefined,
    }
    const pendingSpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        checking: true,
      },
    }

    await act(async () => {
      root.render(
        createElement(VersionPanel, { ...props, space: pendingSpace })
      )
      await Promise.resolve()
    })
    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          ...props,
          space: {
            ...pendingSpace,
            graft: {
              ...pendingSpace.graft,
              checking: false,
              clean: true,
              currentHead: head,
            },
          },
        })
      )
      await Promise.resolve()
    })

    expect(getVersionHistory).toHaveBeenCalledOnce()
    await act(async () => {
      finishHistory?.({
        currentHead: head,
        currentBranch: "main",
        commits: [],
        hasMore: false,
      })
      await Promise.resolve()
    })
    expect(getVersionHistory).toHaveBeenCalledOnce()

    await act(async () => root.unmount())
    host.remove()
  })

  it("refreshes working changes when the Space change token advances", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const getVersionChanges = vi.fn().mockResolvedValue(versionDiff)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
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
    const dirtySpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        clean: false,
        currentHead: "a".repeat(64),
        changeToken: "working-1",
      },
    }

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          ...panelProps,
          space: dirtySpace,
        })
      )
      await Promise.resolve()
    })
    expect(getVersionChanges).toHaveBeenCalledOnce()

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          ...panelProps,
          space: {
            ...dirtySpace,
            graft: { ...dirtySpace.graft, changeToken: "working-2" },
          },
        })
      )
      await Promise.resolve()
    })

    expect(getVersionChanges).toHaveBeenCalledTimes(2)

    await act(async () => root.unmount())
    host.remove()
  })

  it("refreshes working changes when clean state flips without a new change token", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const getVersionChanges = vi.fn().mockResolvedValue(versionDiff)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionChanges,
        getVersionHistory: vi.fn().mockResolvedValue({
          currentHead: "a".repeat(64),
          commits: [],
          hasMore: false,
          nextCursor: null,
        }),
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
    const cleanSpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        clean: true,
        currentHead: "a".repeat(64),
        changeToken: "working-1",
      },
    }

    await act(async () => {
      root.render(
        createElement(VersionPanel, { ...panelProps, space: cleanSpace })
      )
      await Promise.resolve()
    })
    expect(getVersionChanges).not.toHaveBeenCalled()

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          ...panelProps,
          space: {
            ...cleanSpace,
            graft: { ...cleanSpace.graft, clean: false, changedPaths: 3 },
          },
        })
      )
      await Promise.resolve()
    })

    expect(getVersionChanges).toHaveBeenCalledOnce()

    await act(async () => root.unmount())
    host.remove()
  })

  it("mounts only the visible window for a 10k-row table diff", () => {
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
    const mountedRows = markup.match(/class="version-table-diff-row"/g) ?? []

    expect(mountedRows.length).toBeGreaterThan(0)
    expect(mountedRows.length).toBeLessThan(40)
    expect(markup).not.toContain("version-table-diff-status")
    expect(markup).not.toContain("Next row changes")
  })

  it("shows changed cells first and reveals full row context on demand", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const table: SpaceVersionTableDiff = {
      name: "Customers",
      columns: ["id", "name", "status", "updated_at"],
      primaryKeyColumns: ["id"],
      changes: [
        {
          op: "update",
          key: { id: "customer-1" },
          oldValues: ["customer-1", "Mei Lin", "Lead", "2026-08-01"],
          values: ["customer-1", "Mei Lin", "Customer", "2026-08-01"],
        },
      ],
    }

    await act(async () => {
      root.render(createElement(TableDiff, { table }))
    })

    expect(host.textContent).toContain("1 of 4 columns")
    expect(host.querySelector("thead")?.textContent).toContain("status")
    expect(host.querySelector("thead")?.textContent).not.toContain("name")
    expect(
      host.querySelector('td[data-cell-change="update"] del')?.textContent
    ).toContain("Lead")
    expect(
      host.querySelector('td[data-cell-change="update"] ins')?.textContent
    ).toContain("Customer")

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Visible table columns"] button[aria-pressed="false"]'
        )
        ?.click()
    })

    expect(host.textContent).toContain("4 of 4 columns")
    expect(host.querySelector("thead")?.textContent).toContain("name")
    expect(host.querySelector("thead")?.textContent).toContain("updated_at")

    await act(async () => root.unmount())
    host.remove()
  })

  it("opens a changed record and computes a complete long-text cell diff", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const messages: unknown[] = []
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: (() => void) | null = null

        postMessage(message: unknown) {
          messages.push(message)
        }

        terminate() {}
      }
    )
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const before = "# Project brief\n\nThe original long description.\n"
    const after =
      "# Project brief\n\nThe revised long description with context.\n"
    const table: SpaceVersionTableDiff = {
      name: "Articles",
      columns: ["id", "title", "body"],
      primaryKeyColumns: ["id"],
      changes: [
        {
          op: "update",
          key: { id: "article-1" },
          oldValues: ["article-1", "Project brief", before],
          values: ["article-1", "Project brief", after],
        },
      ],
    }

    await act(async () => {
      root.render(createElement(TableDiff, { table, theme: "dark" }))
    })

    expect(
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[aria-label="Visible table columns"] button'
        )
      ).map((button) => button.textContent)
    ).toEqual(["Changed", "All"])

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open record changes for article-1"]'
        )
        ?.click()
    })

    expect(
      host.querySelector('[data-version-table-row-detail="true"]')
    ).not.toBeNull()
    expect(
      host.querySelector(
        '.version-table-diff-toolbar [aria-label="Back to table changes"]'
      )
    ).not.toBeNull()
    const recordToolbar = host.querySelector(".version-table-diff-toolbar")
    expect(recordToolbar?.firstElementChild?.getAttribute("aria-label")).toBe(
      "Back to table changes"
    )
    expect(recordToolbar?.lastElementChild?.getAttribute("aria-label")).toBe(
      "Visible record fields"
    )
    expect(
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[aria-label="Visible record fields"] button'
        )
      ).map((button) => button.textContent)
    ).toEqual(["Changed", "All"])
    expect(
      recordToolbar?.lastElementChild?.previousElementSibling?.getAttribute(
        "aria-label"
      )
    ).toBe("Record diff display")
    expect(
      host.querySelectorAll(".version-row-detail-body > nav > div > button")
        .length
    ).toBe(1)
    expect(host.textContent).toContain("body")
    expect(
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[aria-label="Record diff layout"] button[aria-pressed="true"]'
        )
      ).map((button) => button.textContent)
    ).toEqual(["Unified"])
    expect(
      host
        .querySelector<HTMLButtonElement>('[aria-label="Wrap lines"]')
        ?.getAttribute("aria-checked")
    ).toBe("true")
    const recordDisplayControls = host.querySelector(
      '[aria-label="Record diff display"]'
    )
    expect(
      recordDisplayControls?.firstElementChild?.classList.contains(
        "version-diff-wrap-control"
      )
    ).toBe(true)
    expect(
      recordDisplayControls?.lastElementChild?.getAttribute("aria-label")
    ).toBe("Record diff layout")
    expect(
      host.querySelector(
        '.version-row-cell-text-diff [aria-label="Diff layout"]'
      )
    ).toBeNull()
    expect(messages).toContainEqual({
      before,
      after,
      path: "Articles/body.txt",
    })

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Visible record fields"] button[aria-pressed="false"]'
        )
        ?.click()
    })
    expect(
      host.querySelectorAll(".version-row-detail-body > nav > div > button")
        .length
    ).toBe(3)

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Visible record fields"] button:first-child'
        )
        ?.click()
    })
    expect(
      host.querySelectorAll(".version-row-detail-body > nav > div > button")
        .length
    ).toBe(1)

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Back to table changes"]'
        )
        ?.click()
    })
    expect(
      host.querySelector('[data-version-table-row-detail="true"]')
    ).toBeNull()

    await act(async () => root.unmount())
    host.remove()
  })

  it("pretty-prints JSON configuration fields in Eidos metadata diffs", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const messages: unknown[] = []
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: (() => void) | null = null

        postMessage(message: unknown) {
          messages.push(message)
        }

        terminate() {}
      }
    )
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const before = '{"filter":{"conjunction":"and","conditions":[]},"sorts":[]}'
    const after =
      '{"filter":{"conjunction":"and","conditions":[{"field":"status","operator":"is","value":"open"}]},"sorts":[]}'
    const table: SpaceVersionTableDiff = {
      name: "eidos__views",
      columns: ["id", "query_json"],
      primaryKeyColumns: ["id"],
      changes: [
        {
          op: "update",
          key: { id: "view-1" },
          oldValues: ["view-1", before],
          values: ["view-1", after],
        },
      ],
    }

    await act(async () => {
      root.render(createElement(TableDiff, { table }))
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open record changes for view-1"]'
        )
        ?.click()
    })

    expect(messages).toContainEqual({
      before: `${JSON.stringify(JSON.parse(before), null, 2)}\n`,
      after: `${JSON.stringify(JSON.parse(after), null, 2)}\n`,
      path: "eidos__views/query_json.json",
    })
    expect(
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[aria-label="Record diff layout"] button[aria-pressed="true"]'
        )
      ).map((button) => button.textContent)
    ).toEqual(["Split"])

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Record diff layout"] button:last-child'
        )
        ?.click()
    })
    expect(
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[aria-label="Record diff layout"] button[aria-pressed="true"]'
        )
      ).map((button) => button.textContent)
    ).toEqual(["Unified"])

    await act(async () => {
      root.render(createElement(TableDiff, { table: { ...table } }))
    })
    expect(
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[aria-label="Record diff layout"] button[aria-pressed="true"]'
        )
      ).map((button) => button.textContent)
    ).toEqual(["Unified"])

    await act(async () => root.unmount())
    host.remove()
  })

  it("falls back to plain text when Eidos metadata JSON is invalid", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const messages: unknown[] = []
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: (() => void) | null = null

        postMessage(message: unknown) {
          messages.push(message)
        }

        terminate() {}
      }
    )
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const before = '{"filter":'
    const after = '{"filter":{"conjunction":"and"}}'
    const table: SpaceVersionTableDiff = {
      name: "eidos__views",
      columns: ["id", "query_json"],
      primaryKeyColumns: ["id"],
      changes: [
        {
          op: "update",
          key: { id: "view-1" },
          oldValues: ["view-1", before],
          values: ["view-1", after],
        },
      ],
    }

    await act(async () => {
      root.render(createElement(TableDiff, { table }))
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open record changes for view-1"]'
        )
        ?.click()
    })

    expect(messages).toContainEqual({
      before,
      after,
      path: "eidos__views/query_json.txt",
    })

    await act(async () => root.unmount())
    host.remove()
  })

  it("renders added, deleted, and updated rows as distinct table tracks", () => {
    const table: SpaceVersionTableDiff = {
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
          op: "delete",
          key: { name: "Lin Wei" },
          values: ["Lin Wei", "Archived"],
        },
        {
          op: "update",
          key: { name: "Mei Lin" },
          oldValues: ["Mei Lin", "Lead"],
          values: ["Mei Lin", "Customer"],
        },
      ],
    }

    const markup = renderToStaticMarkup(createElement(TableDiff, { table }))

    expect(markup).toContain('data-row-change="insert"')
    expect(markup).toContain('data-row-change="delete"')
    expect(markup).toContain('data-row-change="update"')
    expect(markup).toContain('data-cell-change="insert"')
    expect(markup).toContain('data-cell-change="delete"')
    expect(markup).toContain('data-cell-change="update"')
    expect(markup).toContain("Archived")
    expect(markup).toContain("Customer")
  })

  it("renders schema-added and schema-deleted columns as one-sided changes", () => {
    const table: SpaceVersionTableDiff = {
      name: "Tasks",
      columns: ["name", "status", "done"],
      columnChanges: [
        null,
        { kind: "deleted", before: "status" },
        { kind: "added", after: "done" },
      ],
      primaryKeyColumns: ["name"],
      changes: [
        {
          op: "update",
          key: { name: "First" },
          oldValues: ["First", "Pending", undefined],
          values: ["First", undefined, null],
        },
        {
          op: "update",
          key: { name: "Second" },
          oldValues: ["Second", "Done", undefined],
          values: ["Second", undefined, 1],
        },
      ],
    }

    const markup = renderToStaticMarkup(createElement(TableDiff, { table }))

    expect(markup).toContain('data-column-schema-change="deleted"')
    expect(markup).toContain('data-column-schema-change="added"')
    expect(markup).toContain("Removed")
    expect(markup).toContain("Added")
    expect(markup).toContain('data-cell-change="column-delete"')
    expect(markup).toContain('data-cell-change="column-insert"')
    expect(markup).toContain("Pending")
    expect(markup).toContain("Done")
    expect(markup).toContain("version-table-schema-empty")
    expect(markup).not.toContain(">null<")
    expect(markup).not.toContain(">—<")
  })

  it("filters table diff rows by change kind", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const table: SpaceVersionTableDiff = {
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
          op: "delete",
          key: { name: "Lin Wei" },
          values: ["Lin Wei", "Archived"],
        },
        {
          op: "update",
          key: { name: "Mei Lin" },
          oldValues: ["Mei Lin", "Lead"],
          values: ["Mei Lin", "Customer"],
        },
      ],
    }

    await act(async () => {
      root.render(createElement(TableDiff, { table }))
    })

    const kindButton = (label: string) =>
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          ".version-table-kind-filter button"
        )
      ).find((button) => button.textContent?.startsWith(label))!
    const visibleRowKinds = () =>
      Array.from(host.querySelectorAll(".version-table-diff-row")).map((row) =>
        row.getAttribute("data-row-change")
      )

    expect(kindButton("All").getAttribute("aria-pressed")).toBe("true")
    expect(visibleRowKinds()).toEqual(["insert", "delete", "update"])

    await act(async () => {
      kindButton("Updated").click()
    })

    expect(visibleRowKinds()).toEqual(["update"])
    expect(host.textContent).toContain("Mei Lin")
    expect(host.textContent).not.toContain("Hao Chen")
    expect(host.textContent).toContain("1 of 1 updated rows")

    await act(async () => {
      kindButton("Added").click()
    })

    expect(visibleRowKinds()).toEqual(["insert"])
    expect(host.textContent).toContain("Hao Chen")

    await act(async () => {
      kindButton("All").click()
    })

    expect(visibleRowKinds()).toEqual(["insert", "delete", "update"])

    await act(async () => root.unmount())
    host.remove()
  })

  it("uses the backend summary for kind counts so unloaded rows stay visible", () => {
    const table: SpaceVersionTableDiff = {
      name: "Events",
      columns: ["_id", "payload"],
      primaryKeyColumns: ["_id"],
      changes: Array.from({ length: 100 }, (_, index) => ({
        op: "insert",
        key: { _id: `event-${index + 1}` },
        values: [`event-${index + 1}`, `payload ${index + 1}`],
      })),
      summary: {
        name: "Events",
        inserts: 3162,
        deletes: 5,
        updates: 2,
      },
      hasMore: true,
      nextCursor: "cursor-100",
    }

    const markup = renderToStaticMarkup(createElement(TableDiff, { table }))

    // Loaded pages only contain inserts, but the filter must advertise the
    // deletes and updates waiting in unloaded pages.
    expect(markup).toContain("Added")
    expect(markup).toContain("3,162")
    expect(markup).toContain("Deleted")
    expect(markup).toContain(">5</small>")
    expect(markup).toContain("Updated")
    expect(markup).toContain(">2</small>")
    expect(markup).toContain("100 of 3,169 changed rows")
  })

  it("loads the next cursor batch when the virtual list nears its end", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const summary = {
      name: "Customers",
      inserts: 150,
      deletes: 0,
      updates: 0,
    }
    const firstTable: SpaceVersionTableDiff = {
      name: "Customers",
      columns: ["name"],
      primaryKeyColumns: [],
      changes: Array.from({ length: 100 }, (_, index) => ({
        op: "insert",
        key: { rowid: index + 1 },
        values: [`Customer ${index + 1}`],
      })),
      summary,
      rowChangesLoaded: true,
      hasMore: true,
      nextCursor: "cursor-100",
    }
    const nextTable: SpaceVersionTableDiff = {
      ...firstTable,
      changes: Array.from({ length: 50 }, (_, index) => ({
        op: "insert",
        key: { rowid: index + 101 },
        values: [`Customer ${index + 101}`],
      })),
      hasMore: false,
      nextCursor: null,
    }
    const getVersionPathDiff = vi.fn().mockResolvedValue({
      ...versionDiff,
      files: [{ ...versionDiff.files[0]!, tables: [nextTable] }],
    })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: { getVersionPathDiff } as unknown as EidosLiteApi,
    })
    const inspection: VersionInspection = {
      type: "table",
      key: "data/crm.eidos/Customers",
      mode: "changes",
      diff: versionDiff,
      change: versionDiff.paths[1]!,
      file: { ...versionDiff.files[0]!, tables: [firstTable] },
      table: firstTable,
      commit: null,
    }

    await act(async () => {
      root.render(
        createElement(VersionDiffPreview, {
          inspection,
          theme: "light",
          onClose: () => undefined,
        })
      )
    })
    expect(host.textContent).toContain("100 of 150 changed rows")
    expect(host.textContent).not.toContain("Scroll for more")
    expect(host.querySelector(".version-table-diff-status")).toBeNull()

    await act(async () => {
      const viewport = host.querySelector<HTMLElement>(
        ".version-table-diff-viewport"
      )!
      viewport.scrollTop = 4_000
      viewport.dispatchEvent(new Event("scroll"))
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getVersionPathDiff).toHaveBeenCalledWith(
      "data/crm.eidos",
      null,
      null,
      "Customers",
      "cursor-100"
    )
    expect(host.textContent).toContain("150 changed rows")
    expect(host.textContent).not.toContain("All loaded")
    expect(
      host.querySelectorAll(".version-table-diff-row").length
    ).toBeLessThan(50)

    await act(async () => root.unmount())
    host.remove()
  })

  it("models Eidos Files as expandable tree nodes with changed tables", () => {
    const model = buildVersionChangeTreeModel(versionDiff)

    expect(model.paths).toEqual([
      "notes/readme.md",
      "data/crm.eidos/",
      "data/crm.eidos/Customers",
    ])
    expect(model.initialExpandedPaths).toEqual([
      "notes/",
      "data/",
      "data/crm.eidos/",
    ])
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

  it("keeps the exact table summary after the first cursor batch loads", () => {
    const table: SpaceVersionTableDiff = {
      name: "1m-bandcamp-sales",
      columns: ["item_type"],
      primaryKeyColumns: [],
      changes: Array.from({ length: 100 }, (_, index) => ({
        op: "insert",
        key: { rowid: index + 1 },
        values: ["album"],
      })),
      summary: {
        name: "1m-bandcamp-sales",
        inserts: 1_000_000,
        deletes: 0,
        updates: 0,
      },
      rowChangesLoaded: true,
      hasMore: true,
      nextCursor: "row-page-1",
    }
    const diff: SpaceVersionDiff = {
      ...versionDiff,
      paths: [versionDiff.paths[1]!],
      files: [{ ...versionDiff.files[0]!, tables: [table] }],
    }
    const model = buildVersionChangeTreeModel(diff)
    const inspection: VersionInspection = {
      type: "table",
      key: "data/crm.eidos/1m-bandcamp-sales",
      mode: "changes",
      diff,
      change: diff.paths[0]!,
      file: diff.files[0]!,
      table,
      commit: null,
    }

    expect(model.decorationByPath.get("data/crm.eidos/1m-bandcamp-sales")).toBe(
      "+1000000"
    )

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        theme: "light",
        onClose: () => undefined,
      })
    )
    expect(markup).toContain("100 of 1,000,000 changed rows")
    expect(markup).not.toContain("Scroll for more")
  })

  it("keeps the tree structure stable when table details finish loading", () => {
    const summaryDiff: SpaceVersionDiff = {
      ...versionDiff,
      files: [
        {
          ...versionDiff.files[0]!,
          tables: [
            {
              ...customersTable,
              changes: [],
              summary: {
                name: customersTable.name,
                inserts: 1,
                deletes: 0,
                updates: 1,
              },
              rowChangesLoaded: false,
            },
          ],
        },
      ],
    }

    expect(
      versionChangeTreeStructureKey(
        buildVersionChangeTreeModel(summaryDiff).paths
      )
    ).toBe(
      versionChangeTreeStructureKey(
        buildVersionChangeTreeModel(versionDiff).paths
      )
    )
  })

  it("reuses a loaded working-tree table diff until its change key changes", async () => {
    clearVersionPathDiffCacheForTests()
    const loader = vi.fn().mockResolvedValue(versionDiff)

    await loadVersionPathDiff("changes:space-1:token-1:meta", loader)
    await loadVersionPathDiff("changes:space-1:token-1:meta", loader)
    await loadVersionPathDiff("changes:space-1:token-2:meta", loader)

    expect(loader).toHaveBeenCalledTimes(2)
  })

  it("does not scan an Eidos File before the user asks for its details", async () => {
    clearVersionPathDiffCacheForTests()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root: Root = createRoot(host)
    const pathOnly: SpaceVersionDiff = { ...versionDiff, files: [] }
    const getVersionPathDiff = vi.fn().mockResolvedValue(versionDiff)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionChanges: vi.fn().mockResolvedValue(pathOnly),
        getVersionPathDiff,
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          space: {
            ...unversionedSpace,
            graft: {
              ...unversionedSpace.graft,
              initialized: true,
              clean: false,
              currentHead: "a".repeat(64),
              changeToken: "warm-working-summary",
            },
          },
          refreshKey: 0,
          onClose: () => undefined,
          onSpaceChange: () => undefined,
          onFilesMaterialized: () => undefined,
          onRefresh: () => undefined,
          onInspectionChange: () => undefined,
        })
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getVersionPathDiff).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    host.remove()
  })

  it("clears version inspection before publishing a saved working snapshot", async () => {
    clearVersionPathDiffCacheForTests()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root: Root = createRoot(host)
    const dirtySpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        clean: false,
        currentHead: "a".repeat(64),
        changeToken: "dirty-table",
      },
    }
    const savedSpace: SpaceSnapshot = {
      ...dirtySpace,
      graft: {
        ...dirtySpace.graft,
        clean: true,
        changedPaths: 0,
        currentHead: "b".repeat(64),
        changeToken: "saved-table",
      },
    }
    const emptyChanges: SpaceVersionDiff = {
      currentHead: savedSpace.graft.currentHead ?? null,
      currentBranch: null,
      from: savedSpace.graft.currentHead ?? null,
      to: null,
      paths: [],
      files: [],
      totalPaths: 0,
      hasMore: false,
      nextCursor: null,
    }
    const getVersionPathDiff = vi.fn().mockResolvedValue(versionDiff)
    let resolveCheckpoint: ((snapshot: SpaceSnapshot) => void) | undefined
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionChanges: vi
          .fn()
          .mockResolvedValueOnce(versionDiff)
          .mockResolvedValue(emptyChanges),
        getVersionPathDiff,
        getVersionHistory: vi.fn().mockResolvedValue({
          currentHead: savedSpace.graft.currentHead ?? null,
          currentBranch: "main",
          commits: [],
          hasMore: false,
          nextCursor: null,
        }),
        createCheckpoint: vi.fn(
          () =>
            new Promise<SpaceSnapshot>((resolve) => {
              resolveCheckpoint = resolve
            })
        ),
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })

    let currentSpace = dirtySpace
    let currentRefreshKey = 0
    let latestInspection: VersionInspection | null = null
    const onInspectionChange = vi.fn((inspection: VersionInspection | null) => {
      latestInspection = inspection
    })
    const renderPanel = () => {
      root.render(
        createElement(VersionPanel, {
          space: currentSpace,
          refreshKey: currentRefreshKey,
          onClose: () => undefined,
          onSpaceChange: (snapshot) => {
            expect(onInspectionChange).toHaveBeenCalledWith(null)
            currentSpace = snapshot
            renderPanel()
          },
          onFilesMaterialized: () => undefined,
          onRefresh: () => {
            currentRefreshKey += 1
            renderPanel()
          },
          onInspectionChange,
        })
      )
    }

    await act(async () => {
      renderPanel()
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const tree = host.querySelector<HTMLElement>("[data-version-change-tree]")
    expect(tree).not.toBeNull()
    const syntheticTableRow = document.createElement("button")
    syntheticTableRow.dataset.itemPath = "data/crm.eidos/Customers"
    syntheticTableRow.textContent = "Customers"
    tree?.append(syntheticTableRow)
    await act(async () => {
      syntheticTableRow.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      )
    })
    expect(latestInspection).toMatchObject({
      type: "table",
      table: { name: "Customers" },
    })
    onInspectionChange.mockClear()

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(".panel-primary-action")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      currentSpace = savedSpace
      renderPanel()
      await Promise.resolve()
    })

    expect(getVersionPathDiff).not.toHaveBeenCalled()
    expect(latestInspection).toMatchObject({ type: "table" })

    await act(async () => {
      resolveCheckpoint?.(savedSpace)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onInspectionChange).toHaveBeenCalledWith(null)
    expect(latestInspection).toBeNull()

    await act(async () => root.unmount())
    host.remove()
  })

  it("recognizes Electron-wrapped Graft cancellation as an expected abort", () => {
    const wrapped = new Error(
      "Error invoking remote method 'eidos-lite:version-path-diff': AbortError: The Graft operation was cancelled"
    )

    expect(isVersionReadAbortError(wrapped)).toBe(true)
    expect(
      isVersionReadAbortError(new DOMException("Cancelled", "AbortError"))
    ).toBe(true)
    expect(isVersionReadAbortError(new Error("Unable to read changes"))).toBe(
      false
    )
  })

  it("builds an instant table tree from a single Eidos File commit summary", () => {
    const commit: SpaceVersionCommit = {
      id: "a".repeat(64),
      parent: "b".repeat(64),
      message: "Update customers",
      timestampMs: 1_700_000_000_000,
      files: 1,
      changes: [],
      tables: [{ name: "Customers", inserts: 1, deletes: 0, updates: 1 }],
      changedTables: 1,
    }
    const summary = withCommitTableSummaries(
      { ...versionDiff, paths: [versionDiff.paths[1]!], files: [] },
      commit
    )

    expect(buildVersionChangeTreeModel(summary)).toMatchObject({
      paths: ["data/crm.eidos/", "data/crm.eidos/Customers"],
    })
    expect(summary.files[0]).toMatchObject({
      path: "data/crm.eidos",
      detailsLoaded: false,
      tables: [
        {
          name: "Customers",
          rowChangesLoaded: false,
          summary: { inserts: 1, deletes: 0, updates: 1 },
        },
      ],
    })
  })

  it("loads historical rows only after selecting a table", async () => {
    clearVersionPathDiffCacheForTests()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root: Root = createRoot(host)
    const commit: SpaceVersionCommit = {
      id: "a".repeat(64),
      parent: "b".repeat(64),
      message: "Update customers",
      timestampMs: 1_700_000_000_000,
      files: 1,
      changes: [],
      tables: [
        { name: "Customers", inserts: 100_000, deletes: 0, updates: 1 },
        { name: "Orders", inserts: 0, deletes: 1, updates: 0 },
      ],
      changedTables: 2,
    }
    const pathSummary: SpaceVersionDiff = {
      ...versionDiff,
      currentHead: commit.id,
      from: commit.parent,
      to: commit.id,
      paths: [versionDiff.paths[1]!],
      files: [],
    }
    let finishPathDiff: ((value: SpaceVersionDiff) => void) | undefined
    const getVersionPathDiff = vi.fn(
      () =>
        new Promise<SpaceVersionDiff>((resolve) => {
          finishPathDiff = resolve
        })
    )
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory: vi.fn().mockResolvedValue({
          currentHead: commit.id,
          currentBranch: null,
          commits: [commit],
          hasMore: false,
        }),
        getVersionDiff: vi.fn().mockResolvedValue(pathSummary),
        getVersionPathDiff,
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })
    const inspections: VersionInspection[] = []
    const versionedSpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        clean: true,
        currentHead: commit.id,
        changeToken: "clean-a",
      },
    }

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          space: versionedSpace,
          refreshKey: 0,
          onClose: () => undefined,
          onSpaceChange: () => undefined,
          onFilesMaterialized: () => undefined,
          onRefresh: () => undefined,
          onInspectionChange: (inspection) => {
            if (inspection) inspections.push(inspection)
          },
        })
      )
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(".commit-row")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(host.textContent).toContain("Customers")
    expect(host.textContent).toContain("Orders")
    expect(host.textContent).toContain("+1")
    expect(host.textContent).toContain("~1")
    expect(getVersionPathDiff).not.toHaveBeenCalled()

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          ".history-change-list > li > ul button"
        )
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(getVersionPathDiff).toHaveBeenCalledOnce()
    expect(getVersionPathDiff).toHaveBeenCalledWith(
      "data/crm.eidos",
      commit.id,
      commit.parent,
      "Customers"
    )
    expect(inspections.at(-1)).toMatchObject({
      type: "table",
      loadingDetails: true,
    })

    await act(async () => finishPathDiff?.(versionDiff))
    expect(host.textContent).toContain("Orders")
    expect(inspections.at(-1)).toMatchObject({
      type: "table",
      loadingDetails: false,
      table: {
        name: "Customers",
        changes: customersTable.changes,
        summary: { inserts: 100_000, deletes: 0, updates: 1 },
      },
    })

    await act(async () => root.unmount())
    host.remove()
  })

  it("keeps rapid history table switching free of cancellation errors", async () => {
    clearVersionPathDiffCacheForTests()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root: Root = createRoot(host)
    const commit: SpaceVersionCommit = {
      id: "c".repeat(64),
      parent: "b".repeat(64),
      message: "Import",
      timestampMs: 1_700_000_000_000,
      files: 1,
      changes: [],
      tables: [
        { name: "eidos__meta", inserts: 0, deletes: 0, updates: 1 },
        { name: "eidos__tables", inserts: 1, deletes: 0, updates: 0 },
      ],
      changedTables: 2,
    }
    const pathSummary: SpaceVersionDiff = {
      ...versionDiff,
      currentHead: commit.id,
      from: commit.parent,
      to: commit.id,
      paths: [versionDiff.paths[1]!],
      files: [],
    }
    const requests: Array<{
      table: string
      resolve(value: SpaceVersionDiff): void
      reject(reason: Error): void
    }> = []
    const getVersionPathDiff = vi.fn(
      (_path, _commitId, _parentId, table: string) =>
        new Promise<SpaceVersionDiff>((resolve, reject) => {
          requests.push({ table, resolve, reject })
        })
    )
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionHistory: vi.fn().mockResolvedValue({
          currentHead: commit.id,
          currentBranch: null,
          commits: [commit],
          hasMore: false,
        }),
        getVersionDiff: vi.fn().mockResolvedValue(pathSummary),
        getVersionPathDiff,
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })
    const inspections: VersionInspection[] = []
    const versionedSpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        clean: true,
        currentHead: commit.id,
        changeToken: "clean-c",
      },
    }

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          space: versionedSpace,
          refreshKey: 0,
          onClose: () => undefined,
          onSpaceChange: () => undefined,
          onFilesMaterialized: () => undefined,
          onRefresh: () => undefined,
          onInspectionChange: (inspection) => {
            if (inspection) inspections.push(inspection)
          },
        })
      )
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(".commit-row")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const tableButtons = () =>
      host.querySelectorAll<HTMLButtonElement>(
        ".history-change-list > li > ul button"
      )

    await act(async () => {
      tableButtons()[0]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      )
      await Promise.resolve()
    })
    await act(async () => {
      tableButtons()[1]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      )
      requests[0]?.reject(
        new Error(
          "Error invoking remote method 'eidos-lite:version-path-diff': AbortError: The Graft operation was cancelled"
        )
      )
      await Promise.resolve()
    })
    await act(async () => {
      tableButtons()[0]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      )
      requests[1]?.reject(
        new Error(
          "Error invoking remote method 'eidos-lite:version-path-diff': AbortError: The Graft operation was cancelled"
        )
      )
      await Promise.resolve()
    })

    expect(requests.map(({ table }) => table)).toEqual([
      "eidos__meta",
      "eidos__tables",
      "eidos__meta",
    ])

    await act(async () => {
      requests[2]?.resolve({
        ...versionDiff,
        files: [
          {
            ...versionDiff.files[0]!,
            tables: [
              {
                ...customersTable,
                name: "eidos__meta",
              },
            ],
          },
        ],
      })
      await Promise.resolve()
    })

    expect(host.querySelector(".version-error")).toBeNull()
    expect(host.textContent).not.toContain("AbortError")
    expect(inspections.at(-1)).toMatchObject({
      type: "table",
      loadingDetails: false,
      table: { name: "eidos__meta" },
    })

    await act(async () => root.unmount())
    host.remove()
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
        theme: "light",
        onClose: () => undefined,
      })
    )

    expect(markup).toContain('data-version-inspector="table"')
    expect(markup).not.toContain("version-inspector-stats")
    expect(markup).not.toContain("version-inspector-heading")
    expect(markup).not.toContain("Latest saved version")
    expect(markup).toContain("Customers")
    expect(markup).toContain("2 changed rows")
    expect(markup.match(/class="version-table-diff-row"/g)).toHaveLength(2)
    expect(markup).toContain("Hao Chen")
    expect(markup).toContain("Customer")
  })

  it("moves record navigation into the inspector breadcrumb", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: (() => void) | null = null
        postMessage() {}
        terminate() {}
      }
    )
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
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const onClose = vi.fn()
    const onNavigate = vi.fn()

    await act(async () => {
      root.render(
        createElement(VersionDiffPreview, {
          inspection,
          theme: "light",
          onClose,
          onNavigate,
        })
      )
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open record changes for Mei Lin"]'
        )
        ?.click()
    })

    const tableCrumb = host.querySelector<HTMLButtonElement>(
      '[aria-label="Back to Customers table changes"]'
    )
    expect(tableCrumb).not.toBeNull()
    expect(host.querySelector(".version-inspector-bar")?.textContent).toContain(
      "Mei Lin"
    )
    expect(
      host.querySelector(
        '.version-table-diff-toolbar [aria-label="Back to table changes"]'
      )
    ).toBeNull()

    await act(async () => tableCrumb?.click())
    expect(
      host.querySelector('[data-version-table-row-detail="true"]')
    ).toBeNull()
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Back to crm.eidos file changes"]'
        )
        ?.click()
    })
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "file", change: inspection.change })
    )
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Back to Changes overview"]'
        )
        ?.click()
    })
    expect(onClose).toHaveBeenCalledOnce()

    await act(async () => root.unmount())
    host.remove()
  })

  it("opens a changed table from the file summary", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const inspection: VersionInspection = {
      type: "file",
      key: "data/crm.eidos",
      mode: "changes",
      diff: versionDiff,
      change: versionDiff.paths[1]!,
      file: versionDiff.files[0]!,
      commit: null,
    }
    const onNavigate = vi.fn()
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        createElement(VersionDiffPreview, {
          inspection,
          theme: "light",
          onClose: () => undefined,
          onNavigate,
        })
      )
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open Customers table changes"]'
        )
        ?.click()
    })

    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "table",
        table: expect.objectContaining({ name: "Customers" }),
      })
    )

    await act(async () => root.unmount())
    host.remove()
  })

  it("shows an honest loading state while changed tables are being discovered", () => {
    const inspection: VersionInspection = {
      type: "file",
      key: "data/crm.eidos/",
      mode: "changes",
      diff: versionDiff,
      change: versionDiff.paths[1]!,
      file: null,
      commit: null,
      loadingDetails: true,
    }

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        theme: "light",
        onClose: () => undefined,
      })
    )

    expect(markup).toContain("Finding changed tables…")
    expect(markup).toContain('data-version-details-loading="true"')
    expect(markup).not.toContain("File change recorded")
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
        theme: "light",
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
        theme: "light",
        onClose: () => undefined,
      })
    )

    expect(markup).toContain("Reading local text…")
    expect(markup).not.toContain("metadata only")
  })

  it("loads local media instead of calling an added image a first version", () => {
    const image = {
      path: "dev/assets/image.png",
      change: "added",
      kind: "binary_file",
    }
    const inspection: VersionInspection = {
      type: "file",
      key: image.path,
      mode: "changes",
      diff: { ...versionDiff, paths: [image], files: [] },
      change: image,
      file: null,
      commit: null,
    }

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        theme: "light",
        onClose: () => undefined,
      })
    )

    expect(markup).toContain("Loading local media…")
    expect(markup).not.toContain("File change recorded")
    expect(markup).not.toContain("first version")
  })

  it("describes a deleted local binary without calling it a first version", () => {
    const deleted = {
      path: "dev/assets/old-image.png",
      change: "deleted",
      kind: "binary_file",
    }
    const inspection: VersionInspection = {
      type: "file",
      key: deleted.path,
      mode: "changes",
      diff: { ...versionDiff, paths: [deleted], files: [] },
      change: deleted,
      file: null,
      commit: null,
    }

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        theme: "light",
        onClose: () => undefined,
      })
    )

    expect(markup).toContain("This file was deleted locally")
    expect(markup).not.toContain("first version")
  })

  it("reduces a pure rename to its old and new paths", () => {
    const renamed = {
      path: "docs/new-name.png",
      previousPath: "docs/old-name.png",
      change: "renamed",
      kind: "binary_file",
    }
    const inspection: VersionInspection = {
      type: "file",
      key: renamed.path,
      mode: "changes",
      diff: { ...versionDiff, paths: [renamed], files: [] },
      change: renamed,
      file: null,
      commit: null,
    }

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        theme: "light",
        onClose: () => undefined,
      })
    )

    expect(markup).toContain("version-rename-summary")
    expect(markup).toContain("docs/old-name.png")
    expect(markup).toContain("docs/new-name.png")
    expect(markup).not.toContain("File change recorded")
    expect(markup).not.toContain("metadata only")
    expect(markup).not.toContain("Kind")
  })

  it("shows only the path transition when renamed text is unchanged", () => {
    const markup = renderToStaticMarkup(
      createElement(VersionTextDiffContent, {
        content: {
          path: "docs/new-name.md",
          before: { state: "utf8", content: "Same\n", size: 5 },
          after: { state: "utf8", content: "Same\n", size: 5 },
        },
        previousPath: "docs/old-name.md",
        theme: "light",
      })
    )

    expect(markup).toContain("version-rename-summary")
    expect(markup).toContain("docs/old-name.md")
    expect(markup).toContain("docs/new-name.md")
    expect(markup).not.toContain("Text changes")
    expect(markup).not.toContain("Split")
  })

  it("keeps the text diff when a rename also changes content", () => {
    const markup = renderToStaticMarkup(
      createElement(VersionTextDiffContent, {
        content: {
          path: "docs/new-name.md",
          before: { state: "utf8", content: "Before\n", size: 7 },
          after: { state: "utf8", content: "After\n", size: 6 },
        },
        previousPath: "docs/old-name.md",
        theme: "light",
      })
    )

    expect(markup).toContain("version-rename-summary")
    expect(markup).toContain("Text changes")
    expect(markup).toContain("Split")
  })

  it("offers a hover action and discards every changed file in a folder", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root: Root = createRoot(host)
    const dirtySpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        clean: false,
        currentHead: "a".repeat(64),
        changeToken: "working-tree-2",
      },
    }
    const discardedSpace: SpaceSnapshot = {
      ...dirtySpace,
      graft: {
        ...dirtySpace.graft,
        clean: true,
        changedPaths: 0,
        changeToken: "clean-tree",
      },
    }
    const discardWorkingChanges = vi.fn().mockResolvedValue({
      snapshot: discardedSpace,
      paths: ["notes/readme.md"],
    })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionChanges: vi.fn().mockResolvedValue(versionDiff),
        discardWorkingChanges,
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })
    const onSpaceChange = vi.fn()
    const onFilesMaterialized = vi.fn().mockResolvedValue(undefined)
    const onRefresh = vi.fn()

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          space: dirtySpace,
          refreshKey: 0,
          onClose: () => undefined,
          onSpaceChange,
          onFilesMaterialized,
          onRefresh,
          onInspectionChange: () => undefined,
        })
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const tree = host.querySelector<HTMLElement>("[data-version-change-tree]")
    const folderRow = tree?.shadowRoot?.querySelector<HTMLElement>(
      '[data-item-path="notes/"]'
    )
    expect(folderRow).not.toBeNull()

    await act(async () => {
      folderRow?.dispatchEvent(
        new MouseEvent("pointerover", {
          bubbles: true,
          composed: true,
        })
      )
      await Promise.resolve()
    })
    const action = tree?.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[data-type="context-menu-trigger"][data-visible="true"]'
    )
    expect(action).not.toBeNull()
    await act(async () => {
      action?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, composed: true })
      )
    })
    expect(host.textContent).toContain("Discard changes in notes?")
    expect(discardWorkingChanges).not.toHaveBeenCalled()

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          ".discard-changes-dialog .danger-action"
        )
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(discardWorkingChanges).toHaveBeenCalledWith({
      target: { kind: "folder", path: "notes" },
      expectedHead: versionDiff.currentHead,
      expectedChangeToken: versionDiff.changeToken,
    })
    expect(onSpaceChange).toHaveBeenCalledWith(discardedSpace)
    expect(onFilesMaterialized).toHaveBeenCalledWith(discardedSpace, [
      "notes/readme.md",
    ])
    expect(onRefresh).toHaveBeenCalledOnce()

    await act(async () => root.unmount())
    host.remove()
  })

  it("does not discard when the hover action is used on an Eidos table row", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root: Root = createRoot(host)
    const dirtySpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        clean: false,
        currentHead: "a".repeat(64),
        changeToken: "working-tree-2",
      },
    }
    const discardWorkingChanges = vi.fn()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionChanges: vi.fn().mockResolvedValue(versionDiff),
        discardWorkingChanges,
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })

    await act(async () => {
      root.render(
        createElement(VersionPanel, {
          space: dirtySpace,
          refreshKey: 0,
          onClose: () => undefined,
          onSpaceChange: () => undefined,
          onFilesMaterialized: vi.fn().mockResolvedValue(undefined),
          onRefresh: () => undefined,
          onInspectionChange: () => undefined,
        })
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const tree = host.querySelector<HTMLElement>("[data-version-change-tree]")
    const tableRow = tree?.shadowRoot?.querySelector<HTMLElement>(
      '[data-item-path="data/crm.eidos/Customers"]'
    )
    expect(tableRow).not.toBeNull()

    await act(async () => {
      tableRow?.dispatchEvent(
        new MouseEvent("pointerover", {
          bubbles: true,
          composed: true,
        })
      )
      await Promise.resolve()
    })
    const trigger = tree?.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[data-type="context-menu-trigger"][data-visible="true"]'
    )
    expect(trigger).not.toBeNull()
    await act(async () => {
      trigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, composed: true })
      )
    })
    expect(host.textContent).not.toContain("Discard changes in")
    expect(host.textContent).not.toContain("Discard changes to")
    expect(discardWorkingChanges).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    host.remove()
  })

  it("refreshes version data from the header action", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root: Root = createRoot(host)
    const dirtySpace: SpaceSnapshot = {
      ...unversionedSpace,
      graft: {
        ...unversionedSpace.graft,
        initialized: true,
        clean: false,
        currentHead: "a".repeat(64),
        changeToken: "working-tree-2",
      },
    }
    const getVersionChanges = vi.fn().mockResolvedValue(versionDiff)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getVersionChanges,
        discardWorkingChanges: vi.fn(),
        cancelVersionReads: vi.fn().mockResolvedValue(undefined),
      } as unknown as EidosLiteApi,
    })
    const onRefresh = vi.fn()

    const renderPanel = (refreshKey: number) =>
      createElement(VersionPanel, {
        space: dirtySpace,
        refreshKey,
        onClose: () => undefined,
        onSpaceChange: () => undefined,
        onFilesMaterialized: vi.fn().mockResolvedValue(undefined),
        onRefresh,
        onInspectionChange: () => undefined,
      })

    await act(async () => {
      root.render(renderPanel(0))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(getVersionChanges).toHaveBeenCalledTimes(1)

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>("button[data-refresh-versions]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(onRefresh).toHaveBeenCalledOnce()

    await act(async () => {
      root.render(renderPanel(1))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(getVersionChanges).toHaveBeenCalledTimes(2)

    await act(async () => root.unmount())
    host.remove()
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
