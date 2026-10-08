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
  it.each(["Untitled", ".graftignore", "config.json"])(
    "keeps Text selected and submits the exact name after renaming to %s",
    async (filename) => {
      const container = document.createElement("div")
      document.body.append(container)
      const root = createRoot(container)
      const onSubmit = vi.fn()
      try {
        await act(async () =>
          root.render(
            <PathActionDialog
              state={{ action: "create-file", entry: null }}
              busy={false}
              onCancel={() => {}}
              onSubmit={onSubmit}
            />
          )
        )
        const choices =
          container.querySelectorAll<HTMLButtonElement>('[role="radio"]')
        const input = container.querySelector<HTMLInputElement>(
          "input:not([type=checkbox])"
        )!
        const submit = container.querySelector<HTMLButtonElement>(
          "button[type=submit]"
        )!
        await act(async () => choices[1]!.click())
        expect(input.value).toBe("Untitled.md")

        for (const value of ["Untitled", "", filename]) {
          await act(async () => {
            Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value"
            )!.set!.call(input, value)
            input.dispatchEvent(new Event("input", { bubbles: true }))
          })
          expect(choices[1]!.getAttribute("aria-checked")).toBe("true")
          expect(choices[0]!.getAttribute("aria-checked")).toBe("false")
          expect(submit.disabled).toBe(!value)
          expect(
            container
              .querySelector(".path-dialog-metadata")
              ?.getAttribute("aria-hidden")
          ).toBe("true")
        }
        // Clicking the active type must not rewrite a custom filename either.
        await act(async () => choices[1]!.click())
        expect(input.value).toBe(filename)
        await act(async () => submit.click())
        expect(onSubmit).toHaveBeenCalledWith(filename, "text")
      } finally {
        await act(async () => root.unmount())
        container.remove()
      }
    }
  )

  it("selects plugin formats directly and keeps the typed name while switching with arrow keys", async () => {
    const previous = window.eidosLite
    Object.assign(window, {
      eidosLite: {
        listPlugins: vi.fn().mockResolvedValue({
          plugins: [
            {
              enabled: true,
              manifest: {
                id: "eidos.dashboard",
                fileTemplates: [
                  { id: "blank", title: "Dashboard", extension: ".dashboard" },
                ],
              },
            },
          ],
        }),
      },
    })
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    const onSubmit = vi.fn()
    try {
      await act(async () =>
        root.render(
          <PathActionDialog
            state={{ action: "create-file", entry: null }}
            busy={false}
            onCancel={() => {}}
            onSubmit={onSubmit}
          />
        )
      )
      const name = container.querySelector<HTMLInputElement>(
        "input:not([type=checkbox])"
      )!
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(name, "Downloads.eidos")
        name.dispatchEvent(new Event("input", { bubbles: true }))
      })
      const choices =
        container.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      expect(choices).toHaveLength(3)
      await act(async () => choices[2]!.click())
      expect(name.value).toBe("Downloads.dashboard")
      expect(choices[2]!.getAttribute("aria-checked")).toBe("true")
      expect(
        container
          .querySelector("input[type=checkbox]")
          ?.closest('[aria-hidden="true"]')
      ).not.toBeNull()
      await act(async () =>
        choices[2]!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
        )
      )
      expect(name.value).toBe("Downloads.md")
      expect(document.activeElement).toBe(choices[1])
      await act(async () =>
        choices[1]!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
        )
      )
      await act(async () =>
        container
          .querySelector<HTMLButtonElement>("button[type=submit]")!
          .click()
      )
      expect(onSubmit).toHaveBeenCalledWith(
        "Downloads.dashboard",
        "plugin:eidos.dashboard/blank"
      )
    } finally {
      await act(async () => root.unmount())
      container.remove()
      Object.assign(window, { eidosLite: previous })
    }
  })

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

      const selector = container.querySelector('[role="radiogroup"]')!
      expect(selector.closest("header")).toBeNull()
      expect(container.querySelector("select")).toBeNull()
      const templateButtons = Array.from(
        selector.querySelectorAll<HTMLButtonElement>("button")
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
      expect(input.value).toBe("files.eidos")
      await act(async () => templateButtons[1]!.click())
      expect(input.value).toBe("Travel notes.md")
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
