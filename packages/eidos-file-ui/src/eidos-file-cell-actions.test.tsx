import React, { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { EidosFileUIProvider } from "./context"
import {
  EidosFileCellMenu,
  type EidosFileCellMenuState,
} from "./eidos-file-grid-menus"
import {
  EidosFileTableActionsContext,
  type EidosFileTableActions,
} from "./table-actions"
import { mergeMenuOrder, orderMenuItems } from "./menu-order"
import { encodeEidosFileAttachmentPaths } from "@eidos.space/eidos-file"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const state: EidosFileCellMenuState = {
  bounds: { x: 20, y: 20, width: 100, height: 30 },
  point: { x: 20, y: 20 },
  field: {
    id: "field-1",
    tableId: "table-1",
    name: "name",
    tableName: "files",
    tableColumnName: "name",
    type: "text",
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  fieldIndex: 0,
  rowIndex: 0,
  row: { _id: "row-1", name: "a.png" },
  rowRanges: [{ startIndex: 0, endIndex: 1 }],
}
let root: Root
let container: HTMLDivElement
const run = vi.fn()
const save = vi.fn(async (_menu: string, _order: readonly string[]) => {})
const onOpenRecord = vi.fn()
let actions: EidosFileTableActions
function Harness({
  initialOrder = [],
  row = state,
  onOpenFile,
}: {
  initialOrder?: readonly string[]
  row?: EidosFileCellMenuState
  onOpenFile?: () => void
}) {
  const [order, setOrder] = useState(initialOrder)
  const [open, setOpen] = useState(true)
  return (
    <EidosFileUIProvider
      menuOrders={{ "grid.cell": order }}
      onMenuOrderChange={async (menu, next) => {
        await save(menu, next)
        setOrder(next)
      }}
    >
      <EidosFileTableActionsContext.Provider value={actions}>
        <EidosFileCellMenu
          state={row}
          open={open}
          onOpenChange={setOpen}
          selectionCount={1}
          cellText="a.png"
          canDelete={false}
          onOpenRecord={onOpenRecord}
          onCopyCell={vi.fn()}
          onCopyRecordId={vi.fn()}
          onOpenFile={onOpenFile}
          onDeleteRows={vi.fn()}
        />
      </EidosFileTableActionsContext.Provider>
    </EidosFileUIProvider>
  )
}
const ids = () =>
  [...document.body.querySelectorAll<HTMLElement>("[data-menu-action]")].map(
    (item) => item.dataset.menuAction
  )
const key = async (type: "keydown" | "keyup", key: string) => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }))
  })
}
async function dragFirstToTop({ releaseAlt = false, cancel = false } = {}) {
  const handle = document.body.querySelector<HTMLButtonElement>(
    '[aria-label="Drag to reorder Open in sidebar"]'
  )!
  document.body
    .querySelectorAll<HTMLElement>("[data-menu-action]")
    .forEach((row, index) => {
      row.getBoundingClientRect = () => new DOMRect(20, index * 40, 256, 32)
    })
  await act(async () => {
    handle.focus()
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  if (releaseAlt) await key("keyup", "Alt")
  for (let index = 0; index < 3; index++) {
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          code: "ArrowUp",
          bubbles: true,
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: cancel ? "Escape" : " ",
        code: cancel ? "Escape" : "Space",
        bubbles: true,
        cancelable: true,
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  run.mockClear()
  onOpenRecord.mockClear()
  save.mockReset()
  save.mockResolvedValue(undefined)
  actions = {
    list: vi.fn(async () => [
      { id: "host/open-mapped-file-sidebar", title: "Open in sidebar" },
    ]),
    run,
  }
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

it.each([true, false])(
  "only removes the generic file action when the host confirms an equivalent target: %s",
  async (equivalent) => {
    actions.list = vi.fn(async (target) => {
      expect(target.fileUri).toBe("assets/a.png")
      return [
        {
          id: "host/open-mapped-file-system",
          title: "Open with default app",
          replaces: equivalent ? ("core/open-file" as const) : undefined,
        },
      ]
    })
    const onOpenFile = vi.fn()
    const fileState: EidosFileCellMenuState = {
      ...state,
      field: { ...state.field, type: "file", tableColumnName: "file" },
      row: {
        _id: "row-1",
        file: encodeEidosFileAttachmentPaths(["assets/a.png"]),
      },
    }
    await act(async () =>
      root.render(<Harness row={fileState} onOpenFile={onOpenFile} />)
    )
    expect(ids().includes("core/open-file")).toBe(!equivalent)
    expect(ids()).toContain("host/open-mapped-file-system")
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[data-menu-action="host/open-mapped-file-system"] [role="menuitem"]'
        )!
        .click()
    )
    expect(run).toHaveBeenCalledWith(
      "host/open-mapped-file-system",
      expect.objectContaining({ fileUri: "assets/a.png" })
    )
    expect(onOpenFile).not.toHaveBeenCalled()
  }
)

it("retains the generic attachment action for an ordinary table without a host equivalent", async () => {
  actions.list = vi.fn(async () => [])
  const onOpenFile = vi.fn()
  const fileState: EidosFileCellMenuState = {
    ...state,
    field: { ...state.field, type: "file", tableColumnName: "file" },
    row: {
      _id: "row-1",
      file: encodeEidosFileAttachmentPaths(["assets/a.png"]),
    },
  }
  await act(async () =>
    root.render(<Harness row={fileState} onOpenFile={onOpenFile} />)
  )
  expect(ids()).toContain("core/open-file")
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[data-menu-action="core/open-file"] [role="menuitem"]'
      )!
      .click()
  )
  expect(onOpenFile).toHaveBeenCalledOnce()
})

it("orders available actions, appends new actions and retains unavailable positions on reorder", () => {
  expect(
    orderMenuItems(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      ["missing", "b", "b", "a"]
    )
  ).toEqual([{ id: "b" }, { id: "a" }, { id: "c" }])
  expect(
    mergeMenuOrder(["hidden", "a", "missing", "b"], ["b", "a", "new"])
  ).toEqual(["hidden", "b", "missing", "a", "new"])
})
it("applies saved order across built-in and host actions without running actions in Option mode", async () => {
  await act(async () =>
    root.render(
      <Harness
        initialOrder={["host/open-mapped-file-sidebar", "core/open-record"]}
      />
    )
  )
  expect(ids()[0]).toBe("host/open-mapped-file-sidebar")
  await key("keydown", "Alt")
  expect(document.querySelector('[data-menu-reordering="true"]')).toBeTruthy()
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[data-menu-action="core/open-record"] [role="menuitem"]'
      )!
      .click()
  )
  expect(onOpenRecord).not.toHaveBeenCalled()
  await key("keyup", "Alt")
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[data-menu-action="host/open-mapped-file-sidebar"] [role="menuitem"]'
      )!
      .click()
  )
  expect(run).toHaveBeenCalledExactlyOnceWith("host/open-mapped-file-sidebar", {
    rowId: "row-1",
    ranges: state.rowRanges,
  })
  expect(document.querySelector('[role="menu"]')).toBeNull()
})
it("saves keyboard drag across groups, finishing after Option is released without activation", async () => {
  await act(async () =>
    root.render(<Harness initialOrder={["plugin/uninstalled"]} />)
  )
  await key("keydown", "Alt")
  await dragFirstToTop({ releaseAlt: true })
  expect(save).toHaveBeenCalledExactlyOnceWith("grid.cell", [
    "plugin/uninstalled",
    "host/open-mapped-file-sidebar",
    "core/open-record",
    "core/copy-cell",
    "core/copy-record-id",
    "core/delete-record",
  ])
  expect(ids()[0]).toBe("host/open-mapped-file-sidebar")
  expect(run).not.toHaveBeenCalled()
  expect(document.querySelector('[role="menu"]')).toBeTruthy()
  expect(document.querySelector('[data-menu-reordering="false"]')).toBeTruthy()
})
it("cancels keyboard drag without saving or closing the menu", async () => {
  await act(async () => root.render(<Harness />))
  const before = ids()
  await key("keydown", "Alt")
  await dragFirstToTop({ cancel: true })
  expect(save).not.toHaveBeenCalled()
  expect(ids()).toEqual(before)
  expect(document.querySelector('[role="menu"]')).toBeTruthy()
})
it("rolls back a failed save and allows retry, then restores the default order", async () => {
  await act(async () => root.render(<Harness />))
  const before = ids()
  save.mockRejectedValueOnce(new Error("Disk full"))
  await key("keydown", "Alt")
  await dragFirstToTop()
  expect(ids()).toEqual(before)
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Disk full"
  )
  await dragFirstToTop()
  expect(ids()[0]).toBe("host/open-mapped-file-sidebar")
  await act(async () => {
    ;[
      ...document.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]'
      ),
    ]
      .find((button) => button.textContent === "Restore default order")!
      .click()
  })
  expect(save).toHaveBeenLastCalledWith("grid.cell", [])
  expect(ids()).toEqual(before)
})
it("discards asynchronous action listings for the previous target", async () => {
  let resolveOld!: (items: Array<{ id: string; title: string }>) => void
  actions.list = vi.fn<EidosFileTableActions["list"]>((target) =>
    target.rowId === "row-1"
      ? new Promise<Array<{ id: string; title: string }>>((resolve) => {
          resolveOld = resolve
        })
      : Promise.resolve([{ id: "host/new", title: "New" }])
  )
  await act(async () => root.render(<Harness />))
  await act(async () =>
    root.render(<Harness row={{ ...state, row: { _id: "row-2" } }} />)
  )
  await act(async () => resolveOld([{ id: "host/old", title: "Old" }]))
  expect(ids()).toContain("host/new")
  expect(ids()).not.toContain("host/old")
})
it("closes on window blur so a missed Option keyup cannot leave editing enabled", async () => {
  await act(async () => root.render(<Harness />))
  await key("keydown", "Alt")
  await act(async () => window.dispatchEvent(new Event("blur")))
  expect(document.querySelector('[role="menu"]')).toBeNull()
  expect(save).not.toHaveBeenCalled()
})
