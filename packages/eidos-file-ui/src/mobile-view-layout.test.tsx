import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type {
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "./context"
import { MobileViewLayout } from "./mobile-view-layout"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const table: EidosFileTableSnapshot = {
  table: {
    id: "t",
    name: "Items",
    rawTableName: "tb_items",
    position: 0,
    icon: null,
    description: null,
    createdAt: "",
    updatedAt: "",
  },
  fields: [],
  views: [],
  rowCount: 0,
}
const view: EidosFileViewInfo = {
  id: "v",
  name: "View",
  type: "grid",
  tableId: "t",
  query: "",
  properties: {},
  filter: null,
  sorts: [],
  orderMap: null,
  hiddenFields: [],
  position: 0,
  createdAt: "",
  updatedAt: "",
}
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
async function click(label: string) {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).find(
    (b) => b.getAttribute("aria-label") === label || b.textContent === label
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
}
it.each([
  ["grid", "行密度", "宽松", { rowDensity: "comfortable" }],
  ["calendar", "日历布局", "周", { calendarLayout: "week" }],
  ["gallery", "卡片大小", "大", { cardSize: "large" }],
  ["kanban", "卡片大小", "小", { cardSize: "small" }],
] as const)(
  "updates canonical %s layout properties and dismisses only the choice sheet",
  async (type, label, option, expected) => {
    const update = vi.fn().mockResolvedValue(undefined)
    await act(async () =>
      root.render(
        <EidosFileUIProvider interactionMode="mobile" locale="zh">
          <MobileViewLayout
            table={table}
            view={{ ...view, type }}
            busy={false}
            error=""
            update={update}
          />
        </EidosFileUIProvider>
      )
    )
    await click("布局设置")
    await click(label)
    await click(option)
    expect(update).toHaveBeenCalledWith(expected)
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  }
)
it("keeps a failed choice visible with an error and allows retry", async () => {
  const update = vi
    .fn()
    .mockRejectedValueOnce(new Error("Write failed"))
    .mockResolvedValue(undefined)
  await act(async () =>
    root.render(
      <EidosFileUIProvider interactionMode="mobile" locale="zh">
        <MobileViewLayout
          table={table}
          view={view}
          busy={false}
          error=""
          update={update}
        />
      </EidosFileUIProvider>
    )
  )
  await click("布局设置")
  await click("行密度")
  await click("紧凑")
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(
    document.querySelector('[role="dialog"]')?.getAttribute("aria-label")
  ).toBe("行密度")
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Write failed"
  )
  await click("紧凑")
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
})
