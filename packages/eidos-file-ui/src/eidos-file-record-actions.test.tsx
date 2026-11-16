// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { EidosFileUIProvider } from "./context"
import { EidosFileRecordContextMenu } from "./eidos-file-record-actions"
import { EidosFileTableActionsContext } from "./table-actions"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let cleanup = () => {}
afterEach(() => cleanup())

it("shares Grid menu order and read-only availability, and restores keyboard focus", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  const onOpen = vi.fn()
  const actions = {
    list: vi.fn(async () => [{ id: "host/sidebar", title: "Open in sidebar" }]),
    run: vi.fn(),
  }
  await act(async () =>
    root.render(
      <EidosFileUIProvider
        menuOrders={{
          "grid.cell": [
            "core/copy-record-id",
            "host/sidebar",
            "core/open-record",
            "core/delete-record",
          ],
        }}
      >
        <EidosFileTableActionsContext.Provider value={actions}>
          <EidosFileRecordContextMenu row={{ _id: "target" }} onOpen={onOpen}>
            <article>
              <button>Record</button>
            </article>
          </EidosFileRecordContextMenu>
        </EidosFileTableActionsContext.Provider>
      </EidosFileUIProvider>
    )
  )
  expect(actions.list).not.toHaveBeenCalled()
  const trigger = host.querySelector("button")!
  trigger.focus()
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F10",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
  )
  const menu = document.querySelector<HTMLElement>(
    "[data-eidos-file-record-menu]"
  )!
  const items = Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
  )
  expect(items.map((item) => item.textContent)).toEqual([
    "Copy record ID",
    "Open in sidebar",
    "Open record",
    "Delete record",
  ])
  expect(items[3]!.disabled).toBe(true)
  expect(onOpen).not.toHaveBeenCalled()
  await act(async () =>
    menu.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "End",
        bubbles: true,
        cancelable: true,
      })
    )
  )
  expect(document.activeElement).toBe(items[2])
  await act(async () => items[0]!.click())
  expect(writeText).toHaveBeenCalledWith("target")
  expect(document.querySelector("[data-eidos-file-record-menu]")).toBeNull()
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
})

it("freezes all selected IDs and withholds actions that only understand a single row", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  const actions = {
    list: vi.fn(async () => [{ id: "host/single", title: "Single extension" }]),
    run: vi.fn(),
  }
  const extraActions = vi.fn(() => [])
  const onDelete = vi.fn()
  const onDeleteRowIds = vi.fn()
  let selected = ["a", "b", "c"]
  const scope = {}
  const render = async (actionScope = scope) =>
    act(async () =>
      root.render(
        <EidosFileUIProvider>
          <EidosFileTableActionsContext.Provider value={actions}>
            <EidosFileRecordContextMenu
              row={{ _id: "b" }}
              getActionRowIds={() => selected}
              onDelete={onDelete}
              onDeleteRowIds={onDeleteRowIds}
              actionScope={actionScope}
              extraActions={extraActions}
            >
              <article tabIndex={0}>B</article>
            </EidosFileRecordContextMenu>
          </EidosFileTableActionsContext.Provider>
        </EidosFileUIProvider>
      )
    )
  const open = async () =>
    act(async () =>
      host
        .querySelector("article")!
        .dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
        )
    )
  const click = async (text: string) =>
    act(async () =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent === text)!
        .click()
    )
  await render()
  await open()
  selected = ["b", "d"]
  await click("Copy 3 record IDs")
  expect(writeText).toHaveBeenCalledExactlyOnceWith("a\nb\nc")
  expect(actions.list).not.toHaveBeenCalled()
  expect(extraActions).not.toHaveBeenCalled()
  selected = ["a", "b", "c"]
  await open()
  selected = ["b"]
  await click("Delete 3 records")
  expect(onDeleteRowIds).toHaveBeenCalledExactlyOnceWith(["a", "b", "c"])
  expect(onDelete).not.toHaveBeenCalled()
  expect(actions.run).not.toHaveBeenCalled()
  selected = ["a", "b", "c"]
  await open()
  await render({})
  expect(document.querySelector("[data-eidos-file-record-menu]")).toBeNull()
})
