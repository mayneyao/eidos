import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import {
  MobileNewViewButton,
  MobileViewSwitcher,
  MobileNewRecordButton,
  MobileTableSwitcher,
} from "./mobile-toolbar"
import { EidosFileUIProvider } from "./context"

it.each(["table", "view"] as const)(
  "reorders %s with the handle, retaining selection and rolling back on failure",
  async (kind) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const reorder = vi
      .fn()
      .mockRejectedValueOnce(new Error("保存失败"))
      .mockResolvedValue(undefined)
    const select = vi.fn()
    const items = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ]
    try {
      await act(async () =>
        root.render(
          <EidosFileUIProvider interactionMode="mobile" locale="zh">
            {kind === "table" ? (
              <MobileTableSwitcher
                tables={items}
                activeId="a"
                onReorder={reorder}
              />
            ) : (
              <MobileViewSwitcher
                views={items}
                activeId="a"
                onSelect={select}
                onReorder={reorder}
              >
                {null}
              </MobileViewSwitcher>
            )}
          </EidosFileUIProvider>
        )
      )
      await act(async () =>
        host.querySelector<HTMLButtonElement>("button")!.click()
      )
      const names = () =>
        Array.from(
          document.querySelectorAll(
            ".mobile-sortable-choice button[aria-pressed]"
          )
        ).map((e) => e.textContent)
      const drag = async () => {
        document
          .querySelectorAll<HTMLElement>(".mobile-sortable-choice")
          .forEach((e, index) => {
            e.getBoundingClientRect = () => new DOMRect(0, index * 48, 240, 48)
          })
        const handle = document.querySelector<HTMLButtonElement>(
          '[aria-label="拖动排序：Alpha"]'
        )!
        await act(async () => {
          handle.focus()
          handle.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              code: "Space",
              key: " ",
            })
          )
          await new Promise((r) => setTimeout(r, 0))
        })
        for (const code of ["ArrowDown", "Space"])
          await act(async () => {
            document.dispatchEvent(
              new KeyboardEvent("keydown", {
                bubbles: true,
                code,
                key: code === "Space" ? " " : code,
              })
            )
            await new Promise((r) => setTimeout(r, 0))
          })
      }
      await drag()
      expect(reorder).toHaveBeenCalledWith(["b", "a"])
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(
        "保存失败"
      )
      expect(names()).toEqual(["Alpha", "Beta"])
      await drag()
      expect(names()).toEqual(["Beta", "Alpha"])
      expect(
        document.querySelector('button[aria-pressed="true"]')?.textContent
      ).toBe("Alpha")
      expect(select).not.toHaveBeenCalled()
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  }
)

it("keeps table selection and table management available in the content toolbar", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const select = vi.fn()
  const manage = vi.fn()
  window.eidosSelectTable = select
  window.eidosManageTables = manage
  const click = async (selector: string) =>
    act(async () =>
      document.querySelector<HTMLButtonElement>(selector)!.click()
    )
  try {
    await act(async () =>
      root.render(
        <EidosFileUIProvider interactionMode="mobile" locale="zh">
          <MobileTableSwitcher
            tables={[
              { id: "a", name: "Library" },
              { id: "b", name: "Notes" },
            ]}
            activeId="a"
          />
        </EidosFileUIProvider>
      )
    )
    await click(".mobile-table-switcher")
    await click('.mobile-view-picker button[aria-pressed="false"]')
    expect(select).toHaveBeenCalledWith("b")
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () =>
      root.render(
        <EidosFileUIProvider interactionMode="mobile" locale="zh">
          <MobileTableSwitcher tables={[]} />
        </EidosFileUIProvider>
      )
    )
    await click(".mobile-table-switcher")
    await click(".mobile-create-view")
    expect(manage).toHaveBeenCalledWith("create")
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    delete window.eidosSelectTable
    delete window.eidosManageTables
  }
})

it("separates record creation from view switching and keeps new views in the same sheet", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  function Toolbar() {
    const [active, setActive] = useState("one")
    return (
      <EidosFileUIProvider interactionMode="mobile" locale="zh">
        <MobileViewSwitcher
          views={[
            { id: "one", name: "全部" },
            { id: "two", name: "收藏" },
          ]}
          activeId={active}
          onSelect={setActive}
        >
          <MobileNewViewButton
            options={[{ type: "grid", name: "表格" }]}
            onCreate={async () => setActive("two")}
          />
        </MobileViewSwitcher>
        <MobileNewRecordButton />
      </EidosFileUIProvider>
    )
  }
  const click = async (selector: string) =>
    act(async () =>
      document.querySelector<HTMLButtonElement>(selector)!.click()
    )
  try {
    await act(async () => root.render(<Toolbar />))
    expect(host.querySelector('[aria-label="新建记录"]')?.textContent).toBe("")
    expect(document.querySelector('[aria-label="新建视图"]')).toBeNull()
    await click(".mobile-view-switcher")
    await click('.mobile-view-picker button[aria-pressed="false"]')
    expect(host.querySelector(".mobile-view-switcher")?.textContent).toBe(
      "收藏"
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await click(".mobile-view-switcher")
    await click('.mobile-view-picker button[aria-pressed="false"]')
    await click(".mobile-view-switcher")
    await click('button[aria-label="新建视图"]')
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    await click('[data-create-view="grid"]')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(host.querySelector(".mobile-view-switcher")?.textContent).toBe(
      "收藏"
    )
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it("creates a plugin table view from the new-view menu and surfaces failures", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const create = vi
    .fn()
    .mockRejectedValueOnce(new Error("创建失败"))
    .mockResolvedValue(undefined)
  const type = "plugin:local.chart/bar"
  try {
    await act(async () =>
      root.render(
        <MobileNewViewButton
          options={[
            { type: "grid", name: "表格" },
            { type, name: "柱状图", pluginName: "Chart" },
          ]}
          onCreate={create}
        />
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click()
    )
    const option = () =>
      document.querySelector<HTMLButtonElement>(`[data-create-view="${type}"]`)!
    expect(option()).not.toBeNull()
    expect(option().closest("section")?.getAttribute("aria-label")).toBe(
      "Plugin views"
    )
    expect(option().textContent).toContain("Chart")
    expect(
      document
        .querySelector('[data-create-view="grid"]')
        ?.closest("section")
        ?.getAttribute("aria-label")
    ).toBe("Built-in views")
    await act(async () => option().click())
    expect(create).toHaveBeenCalledWith(type)
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "创建失败"
    )
    await act(async () => option().click())
    expect(create).toHaveBeenCalledTimes(2)
    expect(option()).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
