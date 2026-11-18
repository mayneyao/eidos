// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { EidosLiteFileClipboardStatus } from "../shared/contracts"
import { FileClipboardStatus } from "./file-clipboard-status"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
it("reports preparation, completion and cancellation without changing the focused input", async () => {
  const host = document.createElement("div")
  const input = document.createElement("input")
  document.body.append(host, input)
  const root = createRoot(host)
  let receive!: (status: EidosLiteFileClipboardStatus) => void
  const cancel = vi.fn()
  const previous = Object.getOwnPropertyDescriptor(window, "eidosLite")
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      onFileClipboardStatus: (listener: typeof receive) => {
        receive = listener
        return () => undefined
      },
      cancelPathClipboard: cancel,
    },
  })
  try {
    input.focus()
    await act(async () => root.render(<FileClipboardStatus />))
    expect(host.textContent).toBe("")
    await act(async () => receive({ sequence: 1, phase: "preparing" }))
    const status = host.querySelector('[role="status"]')!
    expect(status.textContent).toBe("Preparing system copy…")
    expect(document.activeElement).toBe(input)
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click()
    )
    expect(cancel).toHaveBeenCalledOnce()
    expect(status.textContent).toBe("Preparing system copy…")
    await act(async () => receive({ sequence: 2, phase: "failed" }))
    expect(host.querySelector('[role="status"]')).toBe(status)
    expect(status.textContent).toBe("System copy was not completed")
    await act(async () => receive({ sequence: 3, phase: "completed" }))
    expect(status.textContent).toBe("Files copied")
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click()
    )
    expect(host.textContent).toBe("")
  } finally {
    await act(async () => root.unmount())
    host.remove()
    input.remove()
    if (previous) Object.defineProperty(window, "eidosLite", previous)
    else Reflect.deleteProperty(window, "eidosLite")
  }
})
