// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { TextSearchProgress } from "../shared/text-search"
import { WorkspaceTextSearch } from "./workspace-text-search"

vi.mock("./i18n", () => ({
  useEidosLiteI18n: () => ({ t: (text: string) => text }),
}))

it("ignores old query results and cancels before a debounced scan begins", async () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const listeners: ((progress: TextSearchProgress) => void)[] = []
  const search = vi.fn(
    (_id: string, _query: string) =>
      new Promise<TextSearchProgress>(() => undefined)
  )
  const cancel = vi.fn(async () => undefined)
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      searchSpaceText: search,
      cancelTextSearch: cancel,
      onTextSearchProgress: (
        listener: (progress: TextSearchProgress) => void
      ) => {
        listeners.push(listener)
        return () => undefined
      },
    },
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const change = async (query: string) =>
    act(async () => {
      const input = host.querySelector("input")!
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, query)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  try {
    await act(async () =>
      root.render(
        <WorkspaceTextSearch
          onOpen={async () => undefined}
          onClose={() => undefined}
        />
      )
    )
    await change("first")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 240))
    })
    const firstId = search.mock.calls[0]?.[0]
    expect(firstId).toBeTruthy()
    await change("second")
    await act(async () =>
      listeners[0]!({
        requestId: firstId!,
        hits: [
          {
            relativePath: "stale.md",
            query: "first",
            revision: "1",
            start: 0,
            end: 5,
            line: 1,
            column: 1,
            snippet: "stale",
          },
        ],
        done: true,
        stopped: null,
        scanned: 1,
        skipped: 0,
        errors: 0,
      })
    )
    expect(host.textContent).not.toContain("stale.md")
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Stop search")!
        .click()
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 240))
    })
    expect(search).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith(firstId)
    expect(host.textContent).toContain("Search stopped. Results are partial.")
    const panel = host.querySelector<HTMLElement>('[role="tabpanel"]')!
    panel.scrollTop = 120
    const other = document.createElement("button")
    host.append(other)
    other.focus()
    await act(async () =>
      root.render(
        <WorkspaceTextSearch
          hidden
          onOpen={async () => undefined}
          onClose={() => undefined}
        />
      )
    )
    expect(panel.hidden).toBe(true)
    expect(document.activeElement).toBe(other)
    await act(async () =>
      root.render(
        <WorkspaceTextSearch
          onOpen={async () => undefined}
          onClose={() => undefined}
        />
      )
    )
    expect(panel.hidden).toBe(false)
    expect(panel.scrollTop).toBe(120)
    expect(host.querySelector("input")!.value).toBe("second")
    expect(document.activeElement).toBe(host.querySelector("input"))
    expect(host.textContent).toContain("Search stopped. Results are partial.")
    expect(search).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
