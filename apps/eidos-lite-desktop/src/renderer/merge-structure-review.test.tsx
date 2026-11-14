// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import type { EidosLiteApi, EidosSyncMergePath } from "../shared/contracts"
import { MergeStructureReview } from "./merge-structure-review"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it("replans when Undo publishes its token before the refreshed path becomes unmerged", async () => {
  const host = document.createElement("div")
  const root = createRoot(host)
  const readSyncMergeSchemaPlan = vi.fn(async () => ({
    ok: true,
    value: {
      supported: true,
      blockers: [],
      fields: [
        {
          tableId: "projects",
          tableName: "Projects",
          fieldId: "owner",
          baseName: "Owner",
          oursName: "Project lead",
          theirsName: "Assignee",
          type: "text",
          conflicted: true,
        },
      ],
    },
  }))
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      readSyncMergeSchemaPlan,
      readSyncMergeSqlitePreview: vi.fn(async () => ({
        ok: true,
        value: { present: false, tables: [] },
      })),
    } as unknown as EidosLiteApi,
  })
  const props = {
    conflicts: [],
    showBase: false,
    disabled: false,
    onResolvePath: vi.fn(),
    onResolveSchema: vi.fn(),
  }
  const path = (state: EidosSyncMergePath["state"]): EidosSyncMergePath => ({
    path: "records.eidos",
    state,
    kind: "sqlite_database",
    storage: "sqlite_snapshot",
    hasBase: true,
    hasLocal: true,
    hasHosted: true,
  })
  try {
    for (const [stateToken, state] of [
      ["resolved-token", "resolved"],
      ["undo-token", "resolved"],
      ["undo-token", "unmerged"],
    ] as const) {
      await act(async () =>
        root.render(
          createElement(MergeStructureReview, {
            ...props,
            stateToken,
            path: path(state),
          })
        )
      )
    }
    expect(readSyncMergeSchemaPlan).toHaveBeenCalledWith({
      path: "records.eidos",
      stateToken: "undo-token",
    })
    expect(host.querySelector("[data-merge-schema-review]")).not.toBeNull()
  } finally {
    await act(async () => root.unmount())
  }
})
