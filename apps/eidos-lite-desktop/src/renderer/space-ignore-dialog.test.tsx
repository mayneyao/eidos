// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"

import { SpaceIgnoreBuilderDialog } from "./space-ignore-dialog"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function inputValue(element: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )!.set!.call(element, value)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

function option(container: HTMLElement, label: string) {
  return Array.from(
    container.querySelectorAll<HTMLLabelElement>("label.space-ignore-option")
  )
    .find((item) => item.textContent?.includes(label))!
    .querySelector<HTMLInputElement>('input[type="checkbox"]')!
}

it("builds graftignore rules locally and saves both files once", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const onSave = vi.fn(async () => {})
  try {
    await act(async () =>
      root.render(
        <SpaceIgnoreBuilderDialog
          rules={{ graftignore: "", gitignore: "" }}
          largeFiles={[{ path: "clip.mp4", size: 30 * 1024 * 1024 }]}
          onCancel={vi.fn()}
          onSave={onSave}
        />
      )
    )
    const save = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    )!
    const editor = container.querySelector<HTMLTextAreaElement>(
      "textarea.space-ignore-editor"
    )!
    expect(save.disabled).toBe(true)

    await act(async () => option(container, "Videos").click())
    expect(editor.value).toContain("*.mp4")
    expect(editor.value).toContain("# Video files")
    expect(save.disabled).toBe(false)

    await act(async () => option(container, "clip.mp4").click())
    expect(editor.value).toContain("/clip.mp4")

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[role="tab"]:last-child')!
        .click()
    )
    const gitEditor = container.querySelector<HTMLTextAreaElement>(
      "textarea.space-ignore-editor"
    )!
    await act(async () => inputValue(gitEditor, "node_modules/\n"))
    await act(async () => save.click())
    expect(onSave).toHaveBeenCalledWith({
      graftignore: expect.stringContaining("/clip.mp4"),
      gitignore: "node_modules/\n",
    })
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

it("keeps a save error visible and cancels on Escape", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const onCancel = vi.fn()
  const onSave = vi.fn(async () => {
    throw new Error("Disk is read-only")
  })
  try {
    await act(async () =>
      root.render(
        <SpaceIgnoreBuilderDialog
          rules={{ graftignore: "", gitignore: "" }}
          largeFiles={[]}
          onCancel={onCancel}
          onSave={onSave}
        />
      )
    )
    await act(async () => option(container, "Temporary files").click())
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[type="submit"]')!.click()
    )
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Disk is read-only"
    )
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
    expect(onCancel).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
