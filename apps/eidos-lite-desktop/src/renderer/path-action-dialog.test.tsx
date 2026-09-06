// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import { PathActionDialog } from "./path-action-dialog"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("linked note confirmation", () => {
  it.each([false, true])(
    "shows the immutable destination and gates submission while busy=%s",
    async (busy) => {
      const container = document.createElement("div")
      document.body.append(container)
      const root = createRoot(container)
      const onSubmit = vi.fn()
      const onCancel = vi.fn()
      try {
        await act(async () =>
          root.render(
            <PathActionDialog
              state={{
                action: "create-linked-note",
                entry: null,
                linkedNotePath: "Notes/New.md",
              }}
              busy={busy}
              onSubmit={onSubmit}
              onCancel={onCancel}
            />
          )
        )
        const input = container.querySelector("input")!
        expect(input.value).toBe("Notes/New.md")
        expect(input.readOnly).toBe(true)
        expect(onSubmit).not.toHaveBeenCalled()
        const submit =
          container.querySelector<HTMLButtonElement>('[type="submit"]')!
        expect(submit.disabled).toBe(busy)
        await act(async () => submit.click())
        if (busy) expect(onSubmit).not.toHaveBeenCalled()
        else expect(onSubmit).toHaveBeenCalledWith("Notes/New.md")
      } finally {
        await act(async () => root.unmount())
        container.remove()
      }
    }
  )
})
