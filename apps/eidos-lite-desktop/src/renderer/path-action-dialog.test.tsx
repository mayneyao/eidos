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

it("confirms the count for a batch Trash action", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const entries = ["a.md", "b.md"].map((name) => ({
    name,
    relativePath: name,
    kind: "file" as const,
    size: 0,
    modifiedAtMs: 1,
  }))
  try {
    await act(async () =>
      root.render(
        <PathActionDialog
          state={{ action: "delete", entry: entries[0]!, entries }}
          busy={false}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )
    )
    expect(container.querySelector("form")?.getAttribute("aria-label")).toBe(
      "Move 2 items to Trash?"
    )
    expect(container.querySelector("form p")?.textContent).toContain(
      "These items will leave this Space"
    )
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

describe("create file templates", () => {
  it("renders 2 file types and toggles file metadata checkbox for Eidos files", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const openExternalUrl = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, {
      eidosLite: {
        ...(window as { eidosLite?: object }).eidosLite,
        openExternalUrl,
      },
    })
    try {
      await act(async () =>
        root.render(
          <PathActionDialog
            state={{ action: "create-file", entry: null }}
            busy={false}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        )
      )
      const input = container.querySelector("input")!
      expect(input.value).toBe("Untitled.eidos")
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe("Untitled".length)

      const templateButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          ".path-dialog-template-btn"
        )
      )
      // Exactly 2 file kinds: Eidos and Note
      expect(templateButtons).toHaveLength(2)
      expect(templateButtons[0]?.textContent).toContain("Eidos")
      expect(templateButtons[0]?.textContent).toBe("Eidos")
      expect(templateButtons[1]?.textContent).toBe("Text")

      // File Table switch row should be visible for Eidos files
      const switchBtn = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]'
      )!
      expect(switchBtn).toBeDefined()
      expect(switchBtn.checked).toBe(false)

      // Toggle File Table switch ON
      await act(async () => switchBtn.click())
      expect(switchBtn.checked).toBe(true)
      expect(input.value).toBe("files.eidos")

      // Check help icon button
      const helpBtn = container.querySelector<HTMLButtonElement>(
        ".path-dialog-hint-help-btn"
      )!
      expect(helpBtn).toBeDefined()
      await act(async () => helpBtn.click())
      expect(openExternalUrl).toHaveBeenCalledWith(
        expect.stringContaining("user-guide/file-metadata")
      )

      // Submit form with File Table
      const submit =
        container.querySelector<HTMLButtonElement>('[type="submit"]')!
      await act(async () => submit.click())
      expect(onSubmit).toHaveBeenCalledWith("files.eidos", "files-index")

      // Switch to Note
      await act(async () => templateButtons[1]!.click())
      expect(input.value).toBe("files.md")
      expect(
        container
          .querySelector(".path-dialog-metadata")
          ?.getAttribute("aria-hidden")
      ).toBe("true")
      expect(
        container.querySelector<HTMLInputElement>('input[type="checkbox"]')
          ?.disabled
      ).toBe(true)

      // Submit form with Note
      await act(async () => submit.click())
      expect(onSubmit).toHaveBeenCalledWith("files.md", "text")
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(input, "Travel notes.md")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await act(async () => templateButtons[0]!.click())
      expect(input.value).toBe("Travel notes.eidos")
      await act(async () => templateButtons[1]!.click())
      expect(input.value).toBe("Travel notes.md")
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
