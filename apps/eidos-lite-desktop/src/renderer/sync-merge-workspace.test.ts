// @vitest-environment jsdom

import { act, createElement, type ChangeEvent, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"

import type {
  EidosLiteApi,
  EidosSyncMergeConflict,
  EidosSyncMergeContent,
  EidosSyncMergePath,
  EidosSyncMergeResponse,
  EidosSyncMergeStatus,
} from "../shared/contracts"
import { buildMergeChangeTreeModel } from "./merge-change-tree"
import { SyncMergeWorkbench, SyncMergeWorkspace } from "./sync-merge-workspace"

vi.mock("./version-text-diff", () => ({
  InlineTextDiff: ({
    title,
    toolbarEnd,
  }: {
    title?: string
    toolbarEnd?: ReactNode
  }) =>
    createElement(
      "section",
      { "data-inline-text-diff": title },
      createElement("strong", null, title),
      toolbarEnd
    ),
}))

vi.mock("./pierre-text-editor-surface", () => ({
  default: ({
    content,
    onChange,
  }: {
    content: string
    onChange(content: string): void
  }) =>
    createElement("textarea", {
      "aria-label": "Merge result",
      value: content,
      onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
        onChange(event.currentTarget.value),
    }),
}))

const head = "a".repeat(64)
const hosted = "b".repeat(64)
const base = "c".repeat(64)
const firstToken = "d".repeat(64)
const secondToken = "e".repeat(64)

const merging = (
  stateToken = firstToken,
  unmergedCount = 1
): Extract<EidosSyncMergeStatus, { state: "merging" }> => ({
  state: "merging",
  localHead: head,
  hostedHead: hosted,
  commonAncestor: base,
  stagedCount: unmergedCount === 0 ? 1 : 0,
  unmergedCount,
  stateToken,
  policyToken: "policy-1",
  policyVersion: 1,
})

const textVersion = (
  version: EidosSyncMergeContent["version"],
  content: string
): EidosSyncMergeContent => ({
  version,
  revision: version === "base" ? base : version === "theirs" ? hosted : head,
  path: "notes.txt",
  kind: "text_file",
  storage: "inline",
  content: { state: "utf8", content, size: Buffer.byteLength(content) },
  stateToken: firstToken,
})

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const match = [...host.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(label)
  )
  if (!match) throw new Error(`Missing ${label} button`)
  return match
}

function mergeTreeButton(host: HTMLElement, path: string): HTMLButtonElement {
  const tree = host.querySelector<HTMLElement>("[data-merge-change-tree]")
  const match = tree?.shadowRoot?.querySelector<HTMLButtonElement>(
    `button[data-item-path='${path}']`
  )
  if (!match) {
    const available = [...(tree?.shadowRoot?.querySelectorAll("button") ?? [])]
      .map((item) => item.getAttribute("data-item-path"))
      .filter(Boolean)
      .join(", ")
    throw new Error(`Missing merge tree path ${path}; found ${available}`)
  }
  return match
}

const mergePath = (
  path: string,
  state: EidosSyncMergePath["state"],
  kind: EidosSyncMergePath["kind"] = "sqlite_database"
): EidosSyncMergePath => ({
  path,
  state,
  kind,
  storage: kind === "sqlite_database" ? "sqlite_snapshot" : "inline",
  hasBase: true,
  hasLocal: true,
  hasHosted: true,
})

const rowConflict = (table: string, id: string): EidosSyncMergeConflict => ({
  id: `row:${table}:${id}`,
  path: "records.eidos",
  pathKind: "sqlite_database",
  storage: "sqlite_snapshot",
  kind: "row",
  reason: "both_updated",
  status: "unresolved",
  table,
  columns: ["_id", "Title", "Status"],
  key: { id },
  baseRow: [id, `${table} base`, "Draft"],
  oursRow: [id, `${table} local`, "Ready"],
  theirsRow: [id, `${table} hosted`, "Blocked"],
})

describe("merge Changes tree", () => {
  it("models tables as children of their Eidos File", () => {
    const records = mergePath("data/records.eidos", "unmerged")
    const notes = mergePath("notes.md", "unmerged", "text_file")
    const resolved = mergePath("archive.eidos", "resolved")
    const model = buildMergeChangeTreeModel(
      [records, notes, resolved],
      new Map([
        [
          records.path,
          [
            { ...rowConflict("Accounts", "1"), path: records.path },
            { ...rowConflict("Accounts", "2"), path: records.path },
            {
              ...rowConflict("Contacts", "3"),
              path: records.path,
              status: "resolved" as const,
              resolution: "ours" as const,
            },
          ],
        ],
      ])
    )

    expect(model.paths).toEqual([
      "Merge Conflicts/",
      "Resolved/",
      "Merge Conflicts/data/records.eidos/",
      "Merge Conflicts/data/records.eidos/Accounts",
      "Merge Conflicts/data/records.eidos/Contacts",
      "Merge Conflicts/notes.md",
      "Resolved/archive.eidos/",
    ])
    expect(
      model.targetByTreePath.get("Merge Conflicts/data/records.eidos/Contacts")
    ).toMatchObject({ path: records, table: "Contacts", scope: "table" })
    expect(
      model.decorationByPath.get("Merge Conflicts/data/records.eidos/Accounts")
    ).toBe("2 conflicts")
    expect(
      model.decorationByPath.get("Merge Conflicts/data/records.eidos/")
    ).toBe("1 of 2 resolved")
    expect(
      model.decorationByPath.get("Merge Conflicts/data/records.eidos/Contacts")
    ).toBe("✓ Resolved")
  })

  it("exposes file-level structure conflicts as Eidos File children", () => {
    const records = mergePath("records.eidos", "unmerged")
    const structureConflict: EidosSyncMergeConflict = {
      id: "schema:file:views",
      path: records.path,
      pathKind: "sqlite_database",
      storage: "sqlite_snapshot",
      kind: "schema",
      reason: "both_changed",
      status: "unresolved",
      name: "views",
      entryType: "schema entry",
      oursOperation: "update",
      theirsOperation: "delete",
    }
    const model = buildMergeChangeTreeModel(
      [records],
      new Map([[records.path, [structureConflict]]])
    )

    expect(model.paths).toContain(
      "Merge Conflicts/records.eidos/File structure"
    )
    expect(
      model.targetByTreePath.get("Merge Conflicts/records.eidos/File structure")
    ).toMatchObject({ path: records, table: null, scope: "structure" })
    expect(
      model.decorationByPath.get("Merge Conflicts/records.eidos/File structure")
    ).toBe("1 conflict")
  })

  it("attributes table schema conflicts to their table node", () => {
    const records = mergePath("records.eidos", "unmerged")
    const schemaConflict: EidosSyncMergeConflict = {
      id: "schema:table:Incidents",
      path: records.path,
      pathKind: "sqlite_database",
      storage: "sqlite_snapshot",
      kind: "schema",
      reason: "schema_modify_conflict",
      status: "unresolved",
      name: "Incidents",
      entryType: "table",
    }
    const model = buildMergeChangeTreeModel(
      [records],
      new Map([
        [records.path, [rowConflict("Incidents", "INC-401"), schemaConflict]],
      ])
    )

    expect(model.paths).toContain("Merge Conflicts/records.eidos/Incidents")
    expect(model.paths).not.toContain(
      "Merge Conflicts/records.eidos/File structure"
    )
    expect(
      model.decorationByPath.get("Merge Conflicts/records.eidos/Incidents")
    ).toBe("1 row · 1 schema")
  })
})

describe("SyncMergeWorkbench", () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it("keeps the Sync inspector as the merge entry point and sends review to Changes", async () => {
    const onReviewMerge = vi.fn()
    const onStatusChange = vi.fn()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncMergeStatus: vi.fn(async () => ({
          ok: true as const,
          value: merging(),
        })),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkspace, {
          onStatusChange,
          onReviewMerge,
        })
      )
    )
    await flush()

    expect(host.textContent).toContain("Review in Changes")
    expect(host.querySelector("[data-sync-merge-text]")).toBeNull()
    expect(onStatusChange).toHaveBeenLastCalledWith(merging())

    await act(async () => button(host, "Review in Changes").click())
    expect(onReviewMerge).toHaveBeenCalledTimes(1)
  })

  it("plans and applies a divergent merge from one clear start action", async () => {
    const onReviewMerge = vi.fn()
    const onStatusChange = vi.fn()
    const planSyncMerge = vi.fn(async () => ({
      ok: true as const,
      value: {
        kind: "three_way" as const,
        expectedHead: head,
        hostedHead: hosted,
        commonAncestor: base,
        stagedPaths: ["clean.txt"],
        conflictedPaths: ["notes.txt"],
        planToken: firstToken,
      },
    }))
    const applySyncMerge = vi.fn(async () => ({
      ok: true as const,
      value: merging(),
    }))
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncMergeStatus: vi.fn(async () => ({
          ok: true as const,
          value: { state: "none" as const },
        })),
        planSyncMerge,
        applySyncMerge,
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkspace, {
          onStatusChange,
          onReviewMerge,
        })
      )
    )
    await flush()

    await act(async () => button(host, "Start merge").click())
    await flush()

    expect(planSyncMerge).toHaveBeenCalledOnce()
    expect(applySyncMerge).toHaveBeenCalledWith({
      expectedHead: head,
      planToken: firstToken,
    })
    expect(onStatusChange).toHaveBeenLastCalledWith(merging())
    expect(onReviewMerge).toHaveBeenCalledOnce()
  })

  it("refreshes the Space instead of applying an up-to-date plan", async () => {
    const snapshot = {
      id: "space-1",
      name: "Space",
      displayPath: "/tmp/Space",
      entries: [],
      eidosFileCount: 0,
      operation: { state: "idle" as const },
      graft: {
        available: true,
        backend: "sdk" as const,
        expectedVersion: "0.4.0",
        initialized: true,
      },
      invalidatedSessionIds: [],
    }
    const onSpaceChange = vi.fn()
    const applySyncMerge = vi.fn()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncMergeStatus: vi.fn(async () => ({
          ok: true as const,
          value: { state: "none" as const },
        })),
        planSyncMerge: vi.fn(async () => ({
          ok: true as const,
          value: {
            kind: "up_to_date" as const,
            expectedHead: head,
            hostedHead: hosted,
            commonAncestor: null,
            stagedPaths: [],
            conflictedPaths: [],
            planToken: firstToken,
          },
        })),
        applySyncMerge,
        refreshSpace: vi.fn(async () => snapshot),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(createElement(SyncMergeWorkspace, { onSpaceChange }))
    )
    await flush()
    await act(async () => button(host, "Start merge").click())
    await flush()

    expect(applySyncMerge).not.toHaveBeenCalled()
    expect(onSpaceChange).toHaveBeenCalledWith(snapshot)
  })

  it("restores durable state, stages edited text with the current token, and continues", async () => {
    const onStatusChange = vi.fn()
    const listSyncMergePaths = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          stateToken: firstToken,
          items: [
            {
              path: "notes.txt",
              state: "unmerged",
              kind: "text_file",
              storage: "inline",
              hasBase: true,
              hasLocal: true,
              hasHosted: true,
            },
          ],
          nextCursor: null,
        },
      })
      .mockResolvedValue({
        ok: true,
        value: {
          stateToken: secondToken,
          items: [
            {
              path: "notes.txt",
              state: "resolved",
              kind: "text_file",
              storage: "inline",
              hasBase: true,
              hasLocal: true,
              hasHosted: true,
            },
          ],
          nextCursor: null,
        },
      })
    const readSyncMergeVersion = vi.fn(async (request) => ({
      ok: true as const,
      value: textVersion(
        request.version,
        request.version === "base"
          ? "base\n"
          : request.version === "theirs"
            ? "hosted\n"
            : "local\n"
      ),
    }))
    let finishWrite!: (
      response: EidosSyncMergeResponse<EidosSyncMergeStatus>
    ) => void
    const writeSyncMergeText = vi.fn(
      () =>
        new Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>((resolve) => {
          finishWrite = resolve
        })
    )
    const continueSyncMerge = vi.fn(async () => ({
      ok: true as const,
      value: { state: "none" as const },
    }))
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listSyncMergePaths,
        readSyncMergeVersion,
        writeSyncMergeText,
        continueSyncMerge,
        getSpace: vi.fn(async () => null),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkbench, {
          initialStatus: merging(),
          theme: "light",
          onClose: vi.fn(),
          onStatusChange,
          onFilesMaterialized: vi.fn(),
        })
      )
    )
    await flush()
    await flush()

    expect(host.textContent).toContain("Base")
    expect(host.textContent).toContain("Local")
    expect(host.textContent).toContain("Hosted")
    expect(
      host
        .querySelector(".sync-merge-editor-toolbar")
        ?.querySelector(".sync-merge-identities.compact")
    ).not.toBeNull()
    expect(
      host.querySelector(".sync-merge-editor > .sync-merge-identities")
    ).toBeNull()
    expect(host.querySelectorAll("[data-inline-text-diff]")).toHaveLength(2)
    expect(host.textContent).toContain("Changes")
    expect(
      host.querySelector<HTMLElement>("[data-merge-change-tree]")?.shadowRoot
        ?.textContent
    ).toContain("Merge Conflicts")
    expect(
      host.querySelector<HTMLButtonElement>("[data-sync-merge-continue]")
        ?.disabled
    ).toBe(true)

    const useHosted = button(host, "Use Hosted")
    await act(async () => useHosted.click())

    expect(writeSyncMergeText).not.toHaveBeenCalled()
    expect(useHosted.textContent).toContain("Using Hosted")
    expect(useHosted.getAttribute("aria-pressed")).toBe("true")
    expect(
      host.querySelector<HTMLTextAreaElement>("[aria-label='Merge result']")
        ?.value
    ).toBe("hosted\n")
    expect(
      host.querySelector("[data-sync-merge-text-result-source]")?.textContent
    ).toContain("Hosted selected")

    const useLocal = button(host, "Use Local")
    await act(async () => useLocal.click())
    expect(useLocal.textContent).toContain("Using Local")
    expect(useLocal.getAttribute("aria-pressed")).toBe("true")
    expect(useHosted.textContent).toContain("Use Hosted")
    expect(useHosted.getAttribute("aria-pressed")).toBe("false")

    await act(async () => useHosted.click())
    const save = button(host, "Save & Stage")
    await act(async () => {
      save.click()
      await Promise.resolve()
    })
    expect(save.textContent).toContain("Saving")
    expect(save.getAttribute("aria-busy")).toBe("true")

    await act(async () =>
      finishWrite({
        ok: true,
        value: merging(secondToken, 0),
      })
    )
    await flush()

    expect(writeSyncMergeText).toHaveBeenCalledWith({
      stateToken: firstToken,
      path: "notes.txt",
      content: "hosted\n",
    })
    const continueButton = host.querySelector<HTMLButtonElement>(
      "[data-sync-merge-continue]"
    )
    expect(continueButton?.disabled).toBe(false)
    expect(host.textContent).toContain("Document resolved")

    await act(async () => continueButton?.click())
    expect(continueSyncMerge).toHaveBeenCalledWith({
      stateToken: secondToken,
      message: "Merge Hosted changes",
    })
    expect(onStatusChange).toHaveBeenLastCalledWith({ state: "none" })
  })

  it("filters the main merge surface when a table child is selected", async () => {
    const conflicts = [
      rowConflict("Accounts", "account-1"),
      rowConflict("Tickets", "ticket-1"),
    ]
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listSyncMergePaths: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            items: [mergePath("records.eidos", "unmerged")],
            nextCursor: null,
          },
        })),
        listSyncMergeConflicts: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            path: request.path,
            items: conflicts,
            nextCursor: null,
          },
        })),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkbench, {
          initialStatus: merging(),
          theme: "light",
          onClose: vi.fn(),
          onStatusChange: vi.fn(),
          onFilesMaterialized: vi.fn(),
        })
      )
    )
    await flush()
    await flush()

    expect(host.querySelector("[data-merge-table='Accounts']")).not.toBeNull()
    expect(host.querySelector("[data-merge-table='Tickets']")).not.toBeNull()

    await act(async () =>
      mergeTreeButton(host, "Merge Conflicts/records.eidos/Tickets").click()
    )

    expect(host.querySelector("[data-merge-table='Accounts']")).toBeNull()
    expect(host.querySelector("[data-merge-table='Tickets']")).not.toBeNull()
    expect(host.querySelector(".sync-merge-editor-intro")).toBeNull()
    expect(
      host.querySelector(".sync-merge-editor-title")?.textContent
    ).toContain("Tickets table")

    await act(async () =>
      mergeTreeButton(host, "Merge Conflicts/records.eidos/").click()
    )

    expect(host.querySelector("[data-merge-table='Accounts']")).not.toBeNull()
    expect(host.querySelector("[data-merge-table='Tickets']")).not.toBeNull()
  })

  it("offers whole-File choices and resolves a complete table atomically", async () => {
    const resolveSyncMergeTable = vi.fn(async () => ({
      ok: true as const,
      value: merging(secondToken, 0),
    }))
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listSyncMergePaths: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            items: [
              mergePath(
                "records.eidos",
                request.stateToken === firstToken ? "unmerged" : "resolved"
              ),
            ],
            nextCursor: null,
          },
        })),
        listSyncMergeConflicts: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            path: request.path,
            items: [
              {
                ...rowConflict("Projects", "project-1"),
                status:
                  request.stateToken === firstToken
                    ? ("unresolved" as const)
                    : ("resolved" as const),
                resolution:
                  request.stateToken === firstToken
                    ? undefined
                    : ("ours" as const),
              },
            ],
            nextCursor: null,
          },
        })),
        resolveSyncMergeTable,
        getSpace: vi.fn(async () => null),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkbench, {
          initialStatus: merging(),
          theme: "light",
          onClose: vi.fn(),
          onStatusChange: vi.fn(),
          onFilesMaterialized: vi.fn(),
        })
      )
    )
    await flush()
    await flush()

    expect(host.textContent).toContain("Use Local File")
    expect(host.textContent).toContain("Use Hosted File")
    await act(async () => button(host, "Use Local Table").click())
    await flush()
    await flush()

    expect(resolveSyncMergeTable).toHaveBeenCalledWith({
      stateToken: firstToken,
      path: "records.eidos",
      table: "Projects",
      result: "ours",
    })
    expect(host.textContent).toContain("Using Local Table")
    expect(host.textContent).toContain("Eidos File resolved")
  })

  it("loads conflicts only for the active Eidos File and reuses the materialized Space snapshot", async () => {
    const snapshot = {
      id: "space-1",
      name: "Space",
      displayPath: "/tmp/Space",
      entries: [],
      eidosFileCount: 3,
      operation: { state: "idle" as const },
      graft: {
        available: true,
        backend: "sdk" as const,
        expectedVersion: "0.4.0",
        initialized: true,
      },
      invalidatedSessionIds: [],
    }
    const listSyncMergePaths = vi.fn(async (request) => ({
      ok: true as const,
      value: {
        stateToken: request.stateToken,
        items: [
          mergePath("alpha.eidos", "unmerged"),
          mergePath("beta.eidos", "unmerged"),
          mergePath("gamma.eidos", "unmerged"),
        ],
        nextCursor: null,
      },
    }))
    const listSyncMergeConflicts = vi.fn(async (request) => ({
      ok: true as const,
      value: {
        stateToken: request.stateToken,
        path: request.path,
        items: [rowConflict("Projects", `${request.path}-project`)],
        nextCursor: null,
      },
    }))
    const resolveSyncMergeTable = vi.fn(async () => ({
      ok: true as const,
      value: merging(secondToken, 2),
    }))
    const getSpace = vi.fn(async () => snapshot)
    const refreshSpace = vi.fn(async () => snapshot)
    const onFilesMaterialized = vi.fn()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listSyncMergePaths,
        listSyncMergeConflicts,
        resolveSyncMergeTable,
        getSpace,
        refreshSpace,
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkbench, {
          initialStatus: merging(),
          theme: "light",
          onClose: vi.fn(),
          onStatusChange: vi.fn(),
          onFilesMaterialized,
        })
      )
    )
    await flush()
    await flush()

    expect(listSyncMergeConflicts).toHaveBeenCalledTimes(1)
    expect(listSyncMergeConflicts).toHaveBeenLastCalledWith({
      stateToken: firstToken,
      path: "alpha.eidos",
      limit: 100,
    })

    await act(async () =>
      host
        .querySelector<HTMLButtonElement>("button[aria-label='Next conflict']")
        ?.click()
    )
    await flush()

    expect(listSyncMergeConflicts).toHaveBeenCalledTimes(2)
    expect(listSyncMergeConflicts).toHaveBeenLastCalledWith({
      stateToken: firstToken,
      path: "beta.eidos",
      limit: 100,
    })

    await act(async () => button(host, "Use Local Table").click())
    await flush()
    await flush()

    expect(listSyncMergeConflicts).toHaveBeenCalledTimes(3)
    expect(listSyncMergeConflicts).toHaveBeenLastCalledWith({
      stateToken: secondToken,
      path: "beta.eidos",
      limit: 100,
    })
    expect(getSpace).toHaveBeenCalledOnce()
    expect(refreshSpace).not.toHaveBeenCalled()
    expect(onFilesMaterialized).toHaveBeenCalledWith(snapshot, ["beta.eidos"])
  })

  it("shows table schema changes beside row differences and blocks unsafe partial choices", async () => {
    const conflict: EidosSyncMergeConflict = {
      id: "schema:file:Incidents",
      path: "records.eidos",
      pathKind: "sqlite_database",
      storage: "sqlite_snapshot",
      kind: "schema",
      reason: "schema_modify_conflict",
      status: "unresolved",
      name: "Incidents",
      entryType: "table",
      oursOperation: "modified",
      theirsOperation: "modified",
      columnChanges: [
        {
          side: "ours",
          operation: "rename_column",
          from: "Status",
          to: "Resolution",
        },
        {
          side: "theirs",
          operation: "rename_column",
          from: "Status",
          to: "State",
        },
      ],
      message: "The same table structure changed differently on both sides.",
    }
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listSyncMergePaths: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            items: [mergePath("records.eidos", "unmerged")],
            nextCursor: null,
          },
        })),
        listSyncMergeConflicts: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            path: request.path,
            items: [
              {
                ...rowConflict("Incidents", "INC-401"),
                columns: ["_id", "Incident", "Resolution"],
                baseRow: ["INC-401", "INC-401", "Investigating"],
                oursRow: ["INC-401", "INC-401", "Contained locally"],
                theirsRow: ["INC-401", "INC-401", "Monitoring in Hosted"],
              },
              conflict,
            ],
            nextCursor: null,
          },
        })),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkbench, {
          initialStatus: merging(),
          theme: "light",
          onClose: vi.fn(),
          onStatusChange: vi.fn(),
          onFilesMaterialized: vi.fn(),
        })
      )
    )
    await flush()
    await flush()

    const tableNode = mergeTreeButton(
      host,
      "Merge Conflicts/records.eidos/Incidents"
    )
    expect(tableNode.dataset.itemPath).toBe(
      "Merge Conflicts/records.eidos/Incidents"
    )
    expect(tableNode.textContent).toContain("1 row · 1 schema")
    await act(async () => tableNode.click())

    const review = host.querySelector(
      "[data-merge-table-schema-conflict='schema:file:Incidents']"
    )
    expect(
      host.querySelector("[data-merge-table='Incidents'] > header")?.textContent
    ).toContain("Incidents")
    expect(review?.textContent).toContain("Base")
    expect(review?.textContent).toContain("Status")
    expect(review?.textContent).toContain("Local")
    expect(review?.textContent).toContain("Resolution")
    expect(review?.textContent).toContain("Hosted")
    expect(review?.textContent).toContain("State")
    expect(
      host.querySelector("thead [data-field-version='base']")?.textContent
    ).toContain("Status")
    expect(
      host.querySelector("thead [data-field-version='local']")?.textContent
    ).toContain("Resolution")
    expect(
      host.querySelector("thead [data-field-version='hosted']")?.textContent
    ).toContain("State")
    expect(host.textContent).toContain(
      "Choose after reviewing the structure conflict"
    )
    expect(button(host, "Use Local File").disabled).toBe(false)
    expect(button(host, "Use Hosted File").disabled).toBe(false)
    expect(button(host, "Use Local Table").disabled).toBe(true)
    expect(button(host, "Use Hosted Table").disabled).toBe(true)
    expect(
      host.querySelector<HTMLButtonElement>(
        "button[aria-label='Use Local row for INC-401']"
      )?.disabled
    ).toBe(true)
    expect(
      host.querySelector<HTMLButtonElement>(
        "button[aria-label='Use Hosted row for INC-401']"
      )?.disabled
    ).toBe(true)
    expect(host.querySelector("[data-sync-merge-schema-review]")).toBeNull()
  })

  it("reviews file-level schema and opaque conflicts without exposing partial choices", async () => {
    const conflicts: EidosSyncMergeConflict[] = [
      {
        id: "schema:file:active_records",
        path: "records.eidos",
        pathKind: "sqlite_database",
        storage: "sqlite_snapshot",
        kind: "schema",
        reason: "schema_modify_conflict",
        status: "unresolved",
        name: "active_records",
        entryType: "view",
        oursOperation: "modified",
        theirsOperation: "deleted",
        message: "The View query changed locally and was deleted in Hosted.",
      },
      {
        id: "opaque:file:search_data",
        path: "records.eidos",
        pathKind: "sqlite_database",
        storage: "sqlite_snapshot",
        kind: "opaque",
        reason: "fts_shadow_table",
        status: "unresolved",
        name: "search_data",
        owner: "search",
        message: "FTS storage must be resolved with the complete Eidos File.",
      },
    ]
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listSyncMergePaths: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            items: [mergePath("records.eidos", "unmerged")],
            nextCursor: null,
          },
        })),
        listSyncMergeConflicts: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            path: request.path,
            items: conflicts,
            nextCursor: null,
          },
        })),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkbench, {
          initialStatus: merging(),
          theme: "light",
          onClose: vi.fn(),
          onStatusChange: vi.fn(),
          onFilesMaterialized: vi.fn(),
        })
      )
    )
    await flush()
    await flush()
    await act(async () =>
      mergeTreeButton(
        host,
        "Merge Conflicts/records.eidos/File structure"
      ).click()
    )

    const review = host.querySelector("[data-sync-merge-schema-review]")
    expect(review?.textContent).toContain("2 structure conflicts")
    expect(review?.textContent).toContain("active_records")
    expect(review?.textContent).toContain("View")
    expect(review?.textContent).toContain("search_data")
    expect(review?.textContent).toContain("Opaque")
    expect(review?.textContent).toContain("Base")
    expect(review?.textContent).toContain("Local")
    expect(review?.textContent).toContain("Hosted")
    expect(button(host, "Use Local File").disabled).toBe(false)
    expect(button(host, "Use Hosted File").disabled).toBe(false)
    expect(host.textContent).not.toContain("Use Local Table")
    expect(host.textContent).not.toContain("Use Hosted Table")
  })

  it("explains Graft's safe recommendation for a legacy logical-equivalence conflict", async () => {
    const conflict: EidosSyncMergeConflict = {
      id: "records.eidos:file:theirs_logically_equivalent_to_base",
      path: "records.eidos",
      pathKind: "sqlite_database",
      storage: "sqlite_snapshot",
      kind: "file",
      reason: "theirs_logically_equivalent_to_base",
      status: "unresolved",
      autoResolvable: true,
      recommendedResult: "ours",
      message: "Hosted is logically equivalent to the common ancestor.",
    }
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listSyncMergePaths: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            items: [mergePath("records.eidos", "unmerged")],
            nextCursor: null,
          },
        })),
        listSyncMergeConflicts: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            path: request.path,
            items: [conflict],
            nextCursor: null,
          },
        })),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkbench, {
          initialStatus: merging(),
          theme: "light",
          onClose: vi.fn(),
          onStatusChange: vi.fn(),
          onFilesMaterialized: vi.fn(),
        })
      )
    )
    await flush()
    await flush()
    await act(async () =>
      mergeTreeButton(
        host,
        "Merge Conflicts/records.eidos/File structure"
      ).click()
    )

    expect(host.textContent).toContain("Safe resolution available")
    expect(host.textContent).toContain("Recommended: keep Local")
    expect(host.textContent).toContain("Logically equivalent to Base")
    expect(host.textContent).toContain("Use Local File · Recommended")
    expect(host.textContent).not.toContain(
      "Choose after reviewing the structure conflict"
    )
  })

  it("does not present a validation-required merged candidate as actionable", async () => {
    const conflict: EidosSyncMergeConflict = {
      id: "records.eidos:file:automatic_merge_available",
      path: "records.eidos",
      pathKind: "sqlite_database",
      storage: "sqlite_snapshot",
      kind: "file",
      reason: "automatic_merge_available",
      status: "unresolved",
      autoResolvable: true,
      recommendedResult: "merged",
      recommendedAction: "apply_merge",
      message: "A validated SQLite candidate is available.",
    }
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listSyncMergePaths: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            items: [mergePath("records.eidos", "unmerged")],
            nextCursor: null,
          },
        })),
        listSyncMergeConflicts: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            path: request.path,
            items: [conflict],
            nextCursor: null,
          },
        })),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkbench, {
          initialStatus: merging(),
          theme: "light",
          onClose: vi.fn(),
          onStatusChange: vi.fn(),
          onFilesMaterialized: vi.fn(),
        })
      )
    )
    await flush()
    await flush()
    await act(async () =>
      mergeTreeButton(
        host,
        "Merge Conflicts/records.eidos/File structure"
      ).click()
    )

    expect(host.textContent).toContain("Combined result unavailable")
    expect(host.textContent).toContain("Needs validation")
    expect(host.textContent).toContain("both versions remain recoverable")
    expect(host.textContent).not.toContain("Safe resolution available")
    expect(host.textContent).not.toContain("Use Local File · Recommended")
    expect(host.textContent).not.toContain("Use Hosted File · Recommended")
  })

  it("keeps resolved table details visible and can undo the whole File resolution", async () => {
    const unresolveSyncMergePath = vi.fn(async () => ({
      ok: true as const,
      value: merging(secondToken, 1),
    }))
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listSyncMergePaths: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            items: [
              mergePath(
                "records.eidos",
                request.stateToken === firstToken ? "resolved" : "unmerged"
              ),
            ],
            nextCursor: null,
          },
        })),
        listSyncMergeConflicts: vi.fn(async (request) => ({
          ok: true as const,
          value: {
            stateToken: request.stateToken,
            path: request.path,
            items: [
              {
                ...rowConflict("Projects", "project-1"),
                status:
                  request.stateToken === firstToken
                    ? ("resolved" as const)
                    : ("unresolved" as const),
                resolution:
                  request.stateToken === firstToken
                    ? ("theirs" as const)
                    : undefined,
              },
            ],
            nextCursor: null,
          },
        })),
        unresolveSyncMergePath,
        getSpace: vi.fn(async () => null),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkbench, {
          initialStatus: merging(firstToken, 0),
          theme: "light",
          onClose: vi.fn(),
          onStatusChange: vi.fn(),
          onFilesMaterialized: vi.fn(),
        })
      )
    )
    await flush()
    await flush()

    const resolved = host.querySelector(
      "[data-sync-merge-path-state='resolved']"
    )
    expect(resolved).not.toBeNull()
    expect(resolved?.textContent).toContain("Eidos File resolved")
    expect(host.querySelector("[data-merge-table='Projects']")).not.toBeNull()
    expect(
      mergeTreeButton(host, "Resolved/records.eidos/Projects")
    ).not.toBeNull()

    await act(async () => button(host, "Undo resolution").click())
    await flush()
    await flush()

    expect(unresolveSyncMergePath).toHaveBeenCalledWith({
      stateToken: firstToken,
      path: "records.eidos",
    })
    expect(
      host.querySelector("[data-sync-merge-path-state='unmerged']")
    ).not.toBeNull()
  })

  it("reloads durable state after a stale cell choice and keeps the warning visible", async () => {
    const newest = "f".repeat(64)
    const getSyncMergeStatus = vi.fn(async () => ({
      ok: true as const,
      value: merging(newest),
    }))
    const listSyncMergePaths = vi.fn(async (request) => ({
      ok: true as const,
      value: {
        stateToken: request.stateToken,
        items: [
          {
            path: "records.eidos",
            state: "unmerged" as const,
            kind: "sqlite_database" as const,
            storage: "sqlite_snapshot" as const,
            hasBase: true,
            hasLocal: true,
            hasHosted: true,
          },
        ],
        nextCursor: null,
      },
    }))
    const listSyncMergeConflicts = vi.fn(async (request) => ({
      ok: true as const,
      value: {
        stateToken: request.stateToken,
        path: "records.eidos",
        items: [
          {
            id: "row:Docs:1",
            path: "records.eidos",
            pathKind: "sqlite_database" as const,
            storage: "sqlite_snapshot" as const,
            kind: "row",
            reason: "both_updated",
            status: "unresolved" as const,
            table: "Docs",
            columns: ["Status"],
            rowColumns: ["_id", "Title", "Status", "Owner"],
            key: { id: "stable-row" },
            baseRow: ["stable-row", "Proposal", "Draft", "Ada"],
            oursRow: ["stable-row", "Proposal", "Ready", "May"],
            theirsRow: ["stable-row", "Proposal", "Blocked", "Grace"],
            cells: [
              {
                column: "Status",
                base: "Draft",
                local: "Ready",
                hosted: "Blocked",
              },
            ],
          },
        ],
        nextCursor: null,
      },
    }))
    const resolveSyncMergeCell = vi.fn(async () => ({
      ok: false as const,
      failure: {
        code: "stale" as const,
        title: "Merge state changed",
        message: "The merge token is stale. The newest state was reloaded.",
        localSafe: true as const,
        retryable: true,
      },
    }))
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncMergeStatus,
        listSyncMergePaths,
        listSyncMergeConflicts,
        resolveSyncMergeCell,
        refreshSpace: vi.fn(async () => null),
      } as unknown as EidosLiteApi,
    })

    await act(async () =>
      root.render(
        createElement(SyncMergeWorkbench, {
          initialStatus: merging(),
          theme: "light",
          onClose: vi.fn(),
          onStatusChange: vi.fn(),
          onFilesMaterialized: vi.fn(),
        })
      )
    )
    await flush()
    await flush()

    const table = host.querySelector("[data-merge-table='Docs']")
    expect(table).not.toBeNull()
    expect(table?.querySelector("thead")?.textContent).toContain("Status")
    expect(table?.querySelector("thead")?.textContent).toContain("Owner")
    expect(table?.querySelector("thead")?.textContent).not.toContain("_id")
    expect(table?.querySelector("pre")).toBeNull()
    expect(
      table?.querySelectorAll("[data-cell-conflict='true']").length
    ).toBeGreaterThan(0)
    expect(table?.querySelector("[data-merge-row-version='base']")).toBeNull()

    await act(async () => button(host, "Show Base").click())
    expect(
      table?.querySelector("[data-merge-row-version='base']")
    ).not.toBeNull()

    const useHostedCell = host.querySelector<HTMLButtonElement>(
      "button[aria-label='Use Hosted value for Status in Proposal']"
    )
    await act(async () => useHostedCell?.click())
    await flush()
    await flush()

    expect(resolveSyncMergeCell).toHaveBeenCalledWith({
      stateToken: firstToken,
      path: "records.eidos",
      table: "Docs",
      identity: { id: "stable-row" },
      column: "Status",
      result: "theirs",
    })
    expect(getSyncMergeStatus).toHaveBeenCalledTimes(1)
    expect(
      host.querySelector("[data-sync-merge-failure='stale']")
    ).not.toBeNull()
    expect(host.textContent).toContain("Merge state changed")
  })
})
