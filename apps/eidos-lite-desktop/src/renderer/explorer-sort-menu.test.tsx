// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { ExplorerSortMenu } from "./explorer-sort-menu"
import { DEFAULT_EXPLORER_SORT } from "./explorer-sort"

vi.mock("./i18n", () => ({
  useEidosLiteI18n: () => ({ t: (text: string) => text }),
}))
it("selects a sort rule and direction, restores focus, and dismisses with Escape", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const change = vi.fn()
  try {
    await act(async () =>
      root.render(
        <ExplorerSortMenu sort={DEFAULT_EXPLORER_SORT} onChange={change} />
      )
    )
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-label="Sort files"]'
    )!
    await act(async () => trigger.click())
    expect(host.querySelector('[aria-pressed="true"]')!.textContent).toBe(
      "Name"
    )
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Modified time")!
        .click()
    )
    expect(change).toHaveBeenLastCalledWith({
      by: "modified",
      direction: "ascending",
    })
    expect(document.activeElement).toBe(trigger)
    await act(async () =>
      root.render(
        <ExplorerSortMenu
          sort={{ by: "modified", direction: "ascending" }}
          onChange={change}
        />
      )
    )
    await act(async () => trigger.click())
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Descending")!
        .click()
    )
    expect(change).toHaveBeenLastCalledWith({
      by: "modified",
      direction: "descending",
    })
    await act(async () => trigger.click())
    await act(async () =>
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(trigger)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
