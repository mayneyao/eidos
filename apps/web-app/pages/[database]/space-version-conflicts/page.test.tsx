// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SpaceVersionConflictsPage } from "./page"

const mocks = vi.hoisted(() => ({
  openTab: vi.fn(),
  resolveConflict: vi.fn(async () => ({
    path: "tasks.base",
    resolution: "ours",
    remainingConflicts: 1,
    status: { hasConflicts: true },
  })),
  refresh: vi.fn(async () => undefined),
}))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({ currentSpace: { id: "space-a" } }),
}))

vi.mock("@/apps/web-app/hooks/use-tab-title", () => ({
  useTabTitle: vi.fn(),
}))

vi.mock("@/apps/web-app/store/tabs", () => ({
  useTabStore: (
    selector: (state: { openTab: typeof mocks.openTab }) => unknown
  ) => selector({ openTab: mocks.openTab }),
}))

vi.mock("@/apps/web-app/hooks/use-space-versioning", () => ({
  useSpaceVersioning: () => ({
    status: {
      enabled: true,
      clean: false,
      hasConflicts: true,
      mergeHead: "remote-2",
      head: { id: "head-2" },
    },
    conflicts: {
      currentHead: "head-2",
      currentBranch: "main",
      mergeHead: "remote-2",
      paths: [
        {
          path: "tasks.base",
          kind: "sqlite_database",
          storage: "sqlite_snapshot",
          status: "unresolved",
          total: 2,
          unresolved: 2,
          resolved: 0,
        },
      ],
      conflicts: [
        {
          id: "tasks.base:row:tb_tasks:7",
          path: "tasks.base",
          pathKind: "sqlite_database",
          storage: "sqlite_snapshot",
          kind: "row",
          reason: "row_conflict",
          status: "unresolved",
          resolution: null,
          table: "tb_tasks",
          columns: ["_id", "title", "status"],
          rowId: 7,
          oursRowId: null,
          theirsRowId: null,
          semanticKey: ["task-7"],
          name: null,
          entryType: null,
          columnChanges: [],
          change: null,
          owner: null,
          oursOperation: "update",
          theirsOperation: "update",
          baseRow: ["task-7", "Draft", "todo"],
          oursRow: ["task-7", "Local title", "todo"],
          theirsRow: ["task-7", "Draft", "done"],
          message: null,
        },
      ],
    },
    statusLoading: false,
    conflictsLoading: false,
    operation: null,
    error: null,
    available: true,
    resolveConflict: mocks.resolveConflict,
    refresh: mocks.refresh,
  }),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("SpaceVersionConflictsPage", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.openTab.mockReset()
    mocks.resolveConflict.mockClear()
    mocks.refresh.mockClear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("reviews Base values and resolves only the selected row", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/version/conflicts?path=tasks.base"]}>
          <SpaceVersionConflictsPage />
        </MemoryRouter>
      )
    })

    expect(container.textContent).toContain("tb_tasks")
    expect(container.textContent).toContain("Local title")
    expect(container.textContent).toContain("done")
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    const keepCurrent = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Keep current"
    )
    await act(async () => {
      keepCurrent?.click()
      await Promise.resolve()
    })

    expect(mocks.resolveConflict).toHaveBeenCalledWith({
      path: "tasks.base",
      resolution: "ours",
      expectedHead: "head-2",
      target: { table: "tb_tasks", rowId: 7 },
    })
  })

  it("opens the selected conflict diff with both merge revisions", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/version/conflicts?path=tasks.base"]}>
          <SpaceVersionConflictsPage />
        </MemoryRouter>
      )
    })

    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Open diff"))
        ?.click()
    })

    expect(mocks.openTab).toHaveBeenCalledWith(
      "/version/diff?path=tasks.base&from=head-2&to=remote-2",
      "tasks.base (Diff)"
    )
  })
})
