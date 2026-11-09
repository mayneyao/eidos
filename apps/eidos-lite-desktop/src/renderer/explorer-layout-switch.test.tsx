// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { ExplorerLayoutSwitch } from "./explorer-layout-switch"
import type { ExplorerLayout } from "./explorer-layout"
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
vi.mock("./i18n", () => ({
  useEidosLiteI18n: () => ({ t: (value: string) => value }),
}))
it("keeps both view choices visible and moves selection by click or arrow keys", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  function Harness({ disabled = false }) {
    const [value, setValue] = useState<ExplorerLayout>("tree")
    return (
      <ExplorerLayoutSwitch
        value={value}
        onChange={setValue}
        disabled={disabled}
      />
    )
  }
  try {
    await act(async () => root.render(<Harness />))
    const buttons = host.querySelectorAll("button")
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true")
    await act(async () => buttons[1]!.click())
    expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true")
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("false")
    expect(
      host
        .querySelector("[data-explorer-layout]")!
        .getAttribute("data-explorer-layout")
    ).toBe("modified")
    await act(async () =>
      buttons[1]!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
      )
    )
    expect(document.activeElement).toBe(buttons[0])
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true")
    await act(async () => root.render(<Harness disabled />))
    expect([...buttons].every((button) => button.disabled)).toBe(true)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it("includes registered Explorer views in click and keyboard navigation", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const plugin = {
    key: "demo.tags/tags",
    label: "Tags",
    pluginName: "Tags Explorer",
    icon: { paths: ["M3 3h9l9 9-9 9-9-9Z"] },
  }
  function Harness() {
    const [value, setValue] = useState<ExplorerLayout>("tree")
    const [selected, setSelected] = useState<string | null>(null)
    return (
      <ExplorerLayoutSwitch
        value={value}
        selectedPlugin={selected}
        plugins={[plugin]}
        onPluginSelect={setSelected}
        onChange={(next) => {
          setSelected(null)
          setValue(next)
        }}
      />
    )
  }
  try {
    await act(async () => root.render(<Harness />))
    const buttons = host.querySelectorAll("button")
    expect(buttons).toHaveLength(3)
    await act(async () => buttons[2]!.click())
    expect(buttons[2]!.getAttribute("aria-pressed")).toBe("true")
    expect(
      host
        .querySelector<HTMLElement>('[role="group"]')!
        .style.getPropertyValue("--explorer-tab-index")
    ).toBe("2")
    expect(buttons[2]!.querySelector("path")?.getAttribute("d")).toBe(
      plugin.icon.paths[0]
    )
    await act(async () =>
      buttons[2]!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true })
      )
    )
    expect(document.activeElement).toBe(buttons[0])
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true")
    await act(async () =>
      buttons[0]!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true })
      )
    )
    expect(document.activeElement).toBe(buttons[2])
    expect(buttons[2]!.getAttribute("aria-pressed")).toBe("true")
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
