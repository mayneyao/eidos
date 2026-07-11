import { afterEach } from "vitest"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

const roots = new Set<Root>()

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

export function render(ui: React.ReactNode): HTMLElement {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  act(() => root.render(ui))
  return container
}

export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount()
  })
  roots.clear()
  document.body.replaceChildren()
})
