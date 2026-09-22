// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { PluginTaskCard } from "./plugin-task-card"

it("minimizes without stopping, restores current progress, and keeps result actions available", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const stop = vi.fn()
  const render = (completed: number, busy = true, run = 1) =>
    root.render(
      <PluginTaskCard
        key={run}
        title="Classify"
        icon={<span>icon</span>}
        busy={busy}
        completed={completed}
        total={80}
        status={busy ? `${completed}/80` : "Done"}
      >
        <button onClick={stop}>{busy ? "Stop" : "Undo"}</button>
      </PluginTaskCard>
    )
  const click = async (label: string) =>
    act(async () => {
      ;(
        container.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement
      ).click()
    })
  try {
    await act(async () => render(12))
    expect(container.querySelector("progress")?.value).toBe(12)
    await click("Minimize task")
    expect(container.querySelector("section")).toBeNull()
    expect(stop).not.toHaveBeenCalled()
    await act(async () => render(48))
    expect(container.textContent).toContain("48/80")
    await click("Restore task")
    await click("Expand task")
    expect(container.querySelector("section")?.className).toContain("w-[36rem]")
    await click("Minimize task")
    await act(async () => render(80, false))
    expect(container.textContent).toContain("View result")
    await click("Restore task")
    expect(container.textContent).toContain("Undo")
    expect(container.querySelector("progress")).toBeNull()
    await click("Close task window")
    expect(container.childElementCount).toBe(0)
    await act(async () => render(80, false))
    expect(container.childElementCount).toBe(0)
    await act(async () => render(0, true, 2))
    expect(container.querySelector("section")).not.toBeNull()
    await click("Close task window")
    await act(async () => render(40, true, 2))
    expect(container.childElementCount).toBe(0)
    expect(stop).not.toHaveBeenCalled()
    await act(async () => render(80, false, 2))
    expect(container.childElementCount).toBe(0)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
