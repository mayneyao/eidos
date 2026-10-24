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
