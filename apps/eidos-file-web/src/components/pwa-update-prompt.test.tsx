// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { I18nProvider } from "../i18n"
import { PwaUpdatePrompt, type PwaUpdatePromptProps } from "./pwa-update-prompt"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const storageValues = new Map<string, string>()
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    get length() {
      return storageValues.size
    },
    clear: () => storageValues.clear(),
    getItem: (key: string) => storageValues.get(key) ?? null,
    key: (index: number) => Array.from(storageValues.keys())[index] ?? null,
    removeItem: (key: string) => storageValues.delete(key),
    setItem: (key: string, value: string) => storageValues.set(key, value),
  } satisfies Storage,
})

describe("PwaUpdatePrompt", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    window.localStorage.setItem("eidos-file-locale", "en")
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    window.localStorage.clear()
  })

  function renderPrompt(overrides: Partial<PwaUpdatePromptProps> = {}) {
    const props: PwaUpdatePromptProps = {
      open: true,
      hasUnsavedChanges: false,
      updating: false,
      onDismiss: vi.fn(),
      onUpdate: vi.fn(),
      ...overrides,
    }
    act(() => {
      root.render(
        <I18nProvider>
          <PwaUpdatePrompt {...props} />
        </I18nProvider>
      )
    })
    return props
  }

  it("offers an explicit refresh when a new version is ready", () => {
    const props = renderPrompt()
    expect(container.textContent).toContain("Update ready")
    expect(container.textContent).toContain("newer Eidos File editor")

    const updateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Update now"
    )
    expect(updateButton?.disabled).toBe(false)
    act(() =>
      updateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    )
    expect(props.onUpdate).toHaveBeenCalledOnce()
  })

  it("keeps the update waiting until current edits are saved", () => {
    const props = renderPrompt({ hasUnsavedChanges: true })
    expect(container.textContent).toContain(
      "Save or download your changes before refreshing"
    )

    const buttons = Array.from(container.querySelectorAll("button"))
    const updateButton = buttons.find(
      (button) => button.textContent === "Save changes first"
    )
    const laterButton = buttons.find((button) => button.textContent === "Later")
    expect(updateButton?.disabled).toBe(true)
    act(() =>
      laterButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    )
    expect(props.onDismiss).toHaveBeenCalledOnce()
    expect(props.onUpdate).not.toHaveBeenCalled()
  })
})
