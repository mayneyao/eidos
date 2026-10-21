// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"

import { SpaceIgnoreDialog } from "./space-ignore-dialog"

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

it("edits both ignore files and saves the changed rules", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const onSave = vi.fn(async () => {})
  try {
    await act(async () =>
      root.render(
        <SpaceIgnoreDialog
          rules={{ graftignore: "*.mp4\n", gitignore: "" }}
          onCancel={vi.fn()}
          onSave={onSave}
        />
      )
    )
    const graft = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label=".graftignore"]'
    )!
    const git = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label=".gitignore"]'
    )!
    expect(graft.value).toBe("*.mp4\n")
    const save = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    )!
    expect(save.disabled).toBe(true)
    await act(async () => {
      inputValue(graft, "*.mp4\n*.mov\n")
      inputValue(git, "node_modules/\n")
    })
    expect(save.disabled).toBe(false)
    await act(async () => save.click())
    expect(onSave).toHaveBeenCalledWith({
      graftignore: "*.mp4\n*.mov\n",
      gitignore: "node_modules/\n",
    })
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

it("cancels on Escape and keeps a save error visible", async () => {
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
        <SpaceIgnoreDialog
          rules={{ graftignore: "", gitignore: "" }}
          onCancel={onCancel}
          onSave={onSave}
        />
      )
    )
    const graft = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label=".graftignore"]'
    )!
    await act(async () => inputValue(graft, "*.mp4\n"))
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
