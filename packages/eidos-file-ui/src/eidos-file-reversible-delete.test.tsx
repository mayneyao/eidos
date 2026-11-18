// @vitest-environment jsdom
import { StrictMode, act, useState } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { Runtime, type EidosFileRow } from "@eidos.space/eidos-file"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"
import {
  EidosFileEditorView,
  type EidosFileViewRendererProps,
} from "./eidos-file-editor-view"
import { EidosFileRecordDeleteDialog } from "./eidos-file-record-delete-dialog"
import { eidosFileMutationHistory } from "./eidos-file-mutation-history"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

async function fixture() {
  const port = await createTestWasmConnection()
  const { service } = await Runtime.create(
    port,
    {
      clock: {
        nowInstant: () => "2026-11-18T00:00:00.000Z",
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      },
    },
    { title: "Reversible UI deletion" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const source = new EidosRuntimeEditorDataSource(service, "owned-delete.eidos")
  await source.initialize()
  const snapshot = await source.createTable({
    name: "Records",
    fields: [{ name: "Title", type: "text", isRecordLabel: true }],
  })
  const table = snapshot.tables[0]!,
    field = table.fields.find((f) => f.name === "Title")!.id
  const rows: EidosFileRow[] = []
  for (let i = 0; i < 3; i++)
    rows.push(
      (await source.insertRow(table.table.id, { [field]: `记录 ${i}` })).row
    )
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container),
    history = eidosFileMutationHistory(source)
  const deleted = vi.fn((ids: readonly string[]) =>
    source.deleteRows(table.table.id, [...ids])
  )
  function Probe(props: EidosFileViewRendererProps) {
    const [bulk, setBulk] = useState<boolean | null>(null)
    return (
      <>
        <button
          onClick={() => setBulk(false)}
          onKeyDown={(e) => {
            if (e.key === "Delete") setBulk(false)
          }}
        >
          Record
        </button>
        <button onClick={() => setBulk(true)}>Delete selection</button>
        <EidosFileRecordDeleteDialog
          row={bulk === null ? null : rows[0]!}
          count={bulk ? 3 : 1}
          disabled={props.disabled}
          undoableDelete={props.canUndoDelete}
          onOpenChange={(open) => {
            if (!open) setBulk(null)
          }}
          onDelete={async (row) => {
            if (bulk)
              await props.onDeleteRowIds!(rows.map((r) => String(r._id)))
            else await props.onDeleteRow!(row)
          }}
        />
      </>
    )
  }
  const render = (
    reversible = true,
    type = "gallery",
    settings = table.table.settings,
    disabled = false
  ) =>
    act(async () =>
      root.render(
        <StrictMode>
          <EidosFileEditorView
            source={source}
            table={{ ...table, table: { ...table.table, settings } }}
            view={{ ...table.views[0]!, type }}
            disabled={disabled}
            capabilities={{
              read: true,
              mutate: !disabled,
              resolveAssets: false,
              rawFile: false,
              nativeFileSystem: false,
              reversibleRowDeletion: reversible,
            }}
            renderers={{ gallery: Probe, feed: Probe }}
            onDeleteRow={async (row) => {
              await deleted([String(row._id)])
            }}
            onDeleteRowIds={deleted}
          />
        </StrictMode>
      )
    )
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
  const key = async (shiftKey = false) =>
    act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          metaKey: true,
          shiftKey,
          bubbles: true,
        })
      )
      await flush()
    })
  const read = async () =>
    (await source.getPage(table.table.id, 0, 20, {})).rows
  return {
    source,
    history,
    rows,
    table,
    container,
    render,
    key,
    flush,
    read,
    deleted,
    close: async () => {
      await act(async () => root.unmount())
      container.remove()
      port.close()
    },
  }
}

it("deletes once without a modal under StrictMode, restores identical rows with CmdZ, and redoes across Views", async () => {
  const f = await fixture()
  try {
    await f.render()
    await act(async () => {
      f.container.querySelector("button")!.focus()
      f.container
        .querySelector("button")!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Delete", bubbles: true })
        )
      await f.flush()
    })
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(f.deleted).toHaveBeenCalledTimes(1)
    expect(await f.read()).toHaveLength(2)
    await f.render(true, "feed")
    await f.key()
    expect(await f.read()).toEqual(f.rows)
    await f.key(true)
    expect(await f.read()).toHaveLength(2)
    expect(f.deleted).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})

it("registers bulk deletion as one shared action and preserves focus outside the completed operation", async () => {
  const f = await fixture()
  try {
    await f.render()
    const external = document.createElement("input")
    document.body.append(external)
    await act(async () => {
      f.container.querySelectorAll("button")[1]!.click()
      external.focus()
      await f.flush()
    })
    expect(await f.read()).toHaveLength(0)
    expect(f.deleted).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(external)
    expect(f.history.getSnapshot().canUndo).toBe(true)
    await act(async () => {
      f.container.querySelector("button")!.focus()
    })
    await f.key()
    expect(await f.read()).toEqual(f.rows)
    expect(f.history.getSnapshot().canUndo).toBe(false)
    external.remove()
  } finally {
    await f.close()
  }
})

it("keeps confirmation for hosts without receipt guarantees, virtual tables, and blocked mutations", async () => {
  const f = await fixture()
  try {
    for (const [guarantee, settings, disabled] of [
      [false, undefined, false],
      [true, { tableType: "virtual" }, false],
      [true, undefined, true],
    ] as const) {
      await f.render(guarantee, "gallery", settings, disabled)
      await act(async () => f.container.querySelector("button")!.click())
      expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
      expect(f.deleted).not.toHaveBeenCalled()
      await act(async () =>
        [...document.querySelectorAll("button")]
          .find((b) => b.textContent === "Cancel")!
          .click()
      )
    }
    expect(await f.read()).toEqual(f.rows)
  } finally {
    await f.close()
  }
})
