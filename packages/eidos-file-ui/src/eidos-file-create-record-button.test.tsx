// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import {
  Runtime,
  type EidosFileRowMutationResult,
  type EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"
import { EidosFileCreateRecordButton } from "./eidos-file-create-record-button"
import { EidosFileEditorShell } from "./eidos-file-editor-shell"
import { EidosFileUIProvider } from "./context"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

async function fixture() {
  const { service } = await Runtime.create(
    await createTestWasmConnection(),
    {
      clock: {
        nowInstant: () => "2026-11-16T16:00:00.123Z",
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      },
    },
    { title: "Toolbar creation" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const source = new EidosRuntimeEditorDataSource(service, "toolbar.eidos", {
    calendarQueryVersion: 2,
    calendarWindowVersion: 1,
  })
  await source.initialize()
  const snapshot = await source.createTable({
    name: "Tasks",
    fields: [
      { name: "Title", type: "text", isRecordLabel: true },
      { name: "Flag", type: "checkbox" },
      { name: "Day", type: "date", property: { defaultValue: "now" } },
    ],
  })
  const table = snapshot.tables[0]!,
    flag = table.fields.find((f) => f.name === "Flag")!,
    day = table.fields.find((f) => f.name === "Day")!
  const view = (type: string, value = true): EidosFileViewInfo => ({
    ...table.views[0]!,
    type,
    filter: {
      type: "group",
      conjunction: "and",
      children: [{ type: "rule", field: flag.id, operator: "equals", value }],
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const close = async () => {
    await act(async () => root.unmount())
    container.remove()
    await service.close({ requestId: "close" })
    vi.restoreAllMocks()
  }
  return { source, table, flag, day, view, container, root, close }
}

it("creates through the one trailing toolbar slot with applied filters and now defaults in all record Views", async () => {
  const f = await fixture(),
    created = vi.fn(),
    error = vi.fn()
  try {
    for (const type of ["grid", "gallery", "calendar", "kanban", "feed"]) {
      await act(async () =>
        f.root.render(
          <EidosFileUIProvider timeZone="Asia/Shanghai">
            <EidosFileEditorShell
              view={f.view(type)}
              calendarPeriodTimeZoneData={["2026f"]}
              calendarWindowVersion={1}
              fields={<button>Fields</button>}
              recordCreator={
                <EidosFileCreateRecordButton
                  source={f.source}
                  table={f.table}
                  view={f.view(type)}
                  onCreated={created}
                  onError={error}
                />
              }
            >
              <div>Records</div>
            </EidosFileEditorShell>
          </EidosFileUIProvider>
        )
      )
      const buttons = [
        ...f.container.querySelectorAll<HTMLButtonElement>(
          "[data-eidos-file-workbar-actions] button"
        ),
      ]
      expect(buttons.map((b) => b.textContent)).toEqual(["Fields", "New"])
      await act(async () => {
        buttons.at(-1)!.click()
        await new Promise((r) => setTimeout(r, 0))
      })
      const result = created.mock.lastCall![0] as EidosFileRowMutationResult
      expect(result.row[f.flag.id], type).toBe(true)
      expect(result.row[f.day.id], type).toBe("2026-11-17")
      expect(
        (
          await f.source.getPage(f.table.table.id, 0, 50, {
            filter: f.view(type).filter,
          })
        ).rows.map((r) => r._id)
      ).toContain(result.row._id)
    }
    expect(created).toHaveBeenCalledTimes(5)
    expect(error).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

it("does not create in virtual/Files, denied or unsupported sources, and disables transiently blocked creation", async () => {
  const f = await fixture(),
    created = vi.fn(),
    error = vi.fn(),
    insert = vi.spyOn(f.source, "insertRow")
  try {
    for (const settings of [
      { capabilities: { insert: false } },
      { tableType: "virtual" },
      { vtabModule: "fs_meta" },
    ]) {
      await act(async () =>
        f.root.render(
          <EidosFileCreateRecordButton
            source={f.source}
            table={{ ...f.table, table: { ...f.table.table, settings } }}
            view={f.view("gallery")}
            onCreated={created}
            onError={error}
          />
        )
      )
      expect(f.container.querySelector("button")).toBeNull()
    }
    await act(async () =>
      f.root.render(
        <EidosFileCreateRecordButton
          source={f.source}
          table={f.table}
          view={f.view("form")}
          onCreated={created}
          onError={error}
        />
      )
    )
    expect(f.container.querySelector("button")).toBeNull()
    for (const property of ["readOnly", "insertRow"]) {
      const unavailable = Object.create(f.source) as typeof f.source
      Object.defineProperty(unavailable, property, {
        value: property === "readOnly" ? true : undefined,
      })
      await act(async () =>
        f.root.render(
          <EidosFileCreateRecordButton
            source={unavailable}
            table={f.table}
            view={f.view("gallery")}
            onCreated={created}
            onError={error}
          />
        )
      )
      expect(f.container.querySelector("button")).toBeNull()
    }
    await act(async () =>
      f.root.render(
        <EidosFileCreateRecordButton
          disabled
          source={f.source}
          table={f.table}
          view={f.view("gallery")}
          onCreated={created}
          onError={error}
        />
      )
    )
    expect(f.container.querySelector("button")!.disabled).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

it("captures the clicked View, suppresses a stale completion, and allows failure retry in the current View", async () => {
  const f = await fixture(),
    created = vi.fn(),
    error = vi.fn()
  try {
    const result = await f.source.insertRow(f.table.table.id, {})
    let finish!: (result: EidosFileRowMutationResult) => void
    const insert = vi.spyOn(f.source, "insertRow").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const render = (view: EidosFileViewInfo) =>
      act(async () =>
        f.root.render(
          <EidosFileCreateRecordButton
            source={f.source}
            table={f.table}
            view={view}
            onCreated={created}
            onError={error}
          />
        )
      )
    await render(f.view("gallery"))
    await act(async () => f.container.querySelector("button")!.click())
    expect(f.container.querySelector("button")!.disabled).toBe(true)
    const next = { ...f.view("kanban", false), id: "different-view" }
    await render(next)
    await act(async () => finish(result))
    expect(created).not.toHaveBeenCalled()
    insert.mockRejectedValueOnce(new Error("retry me"))
    await act(async () => f.container.querySelector("button")!.click())
    expect(error).toHaveBeenCalledTimes(1)
    expect(f.container.querySelector("button")!.disabled).toBe(false)
    await act(async () => {
      f.container.querySelector("button")!.click()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(created.mock.lastCall![0].row[f.flag.id]).toBe(false)
    expect(insert.mock.lastCall![3]?.filter).toEqual(next.filter)
  } finally {
    await f.close()
  }
})
