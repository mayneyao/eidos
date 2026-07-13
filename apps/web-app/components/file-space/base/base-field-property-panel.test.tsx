// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseFieldInfo, UpdateBaseFieldInput } from "@eidos.space/base"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseFieldPropertyPanel } from "./base-field-property-panel"

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
})

function field(
  type: BaseFieldInfo["type"],
  property: Record<string, unknown> | null = null
): BaseFieldInfo {
  return {
    name: type === "select" ? "Status" : "Estimate",
    type,
    tableName: "tb_tasks",
    tableColumnName: type === "select" ? "status" : "estimate",
    property,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

describe("BaseFieldPropertyPanel", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("saves the field name inline without opening a dialog", async () => {
    const onUpdate = vi.fn<
      (field: BaseFieldInfo, changes: UpdateBaseFieldInput) => Promise<void>
    >(() => Promise.resolve())
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("select")}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    expect(
      container.querySelector('[data-base-detail-panel="field"]')?.classList
    ).toContain("base-detail-panel")
    const nameInput = Array.from(container.querySelectorAll("input")).find(
      (input) => input.value === "Status"
    )
    expect(nameInput).toBeTruthy()
    await act(async () => {
      nameInput?.focus()
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(nameInput, "Priority")
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }))
      nameInput?.blur()
      await Promise.resolve()
    })

    expect(onUpdate).toHaveBeenCalledWith(expect.any(Object), {
      name: "Priority",
    })
  })

  it("keeps a failed field name draft visible and retries it in place", async () => {
    const onUpdate = vi
      .fn<
        (field: BaseFieldInfo, changes: UpdateBaseFieldInput) => Promise<void>
      >()
      .mockRejectedValueOnce(new Error("Unable to rename field"))
      .mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("select")}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    const nameInput = Array.from(container.querySelectorAll("input")).find(
      (input) => input.value === "Status"
    )
    await act(async () => {
      nameInput?.focus()
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(nameInput, "Priority")
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }))
      nameInput?.blur()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Unable to rename field"
    )
    expect(nameInput?.value).toBe("Priority")

    await act(async () => {
      nameInput?.focus()
      nameInput?.blur()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(nameInput?.value).toBe("Priority")
  })

  it("prevents closing the field workspace while a write is pending", async () => {
    let finishUpdate: (() => void) | undefined
    const onUpdate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishUpdate = resolve
        })
    )
    const onClose = vi.fn()
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("select")}
          disabled={false}
          onClose={onClose}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    const nameInput = Array.from(container.querySelectorAll("input")).find(
      (input) => input.value === "Status"
    )
    await act(async () => {
      nameInput?.focus()
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(nameInput, "Priority")
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }))
      nameInput?.blur()
      await Promise.resolve()
    })

    const close = container.querySelector<HTMLButtonElement>(
      '[aria-label="Close field properties"]'
    )
    expect(close?.disabled).toBe(true)
    await act(async () => close?.click())
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      finishUpdate?.()
      await Promise.resolve()
    })
    expect(close?.disabled).toBe(false)
  })

  it("cancels an inline field rename with Escape without persisting it", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("select")}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    const nameInput = Array.from(container.querySelectorAll("input")).find(
      (input) => input.value === "Status"
    )
    await act(async () => {
      nameInput?.focus()
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(nameInput, "Priority")
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }))
      nameInput?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
      await Promise.resolve()
    })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(nameInput?.value).toBe("Status")
  })

  it("persists option deletion from the embedded Select editor", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("select", {
            options: [
              { id: "todo", name: "Todo", color: "blue" },
              { id: "done", name: "Done", color: "green" },
            ],
          })}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Delete Todo"]')
        ?.click()
      await Promise.resolve()
    })

    expect(onUpdate).toHaveBeenCalledWith(expect.any(Object), {
      property: {
        options: [{ id: "done", name: "Done", color: "green" }],
      },
    })
  })

  it("keeps option names unique when editing an existing Select field", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("select", {
            options: [
              { id: "todo", name: "Todo", color: "blue" },
              { id: "done", name: "Done", color: "green" },
            ],
          })}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })
    const done = container.querySelector<HTMLInputElement>(
      'input[aria-label="Done option name"]'
    )
    await act(async () => {
      if (done) {
        done.focus()
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set?.call(done, "todo")
        done.dispatchEvent(new Event("input", { bubbles: true }))
        done.blur()
      }
      await Promise.resolve()
    })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(done?.value).toBe("Done")
  })

  it("cancels an inline Select option rename with Escape", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("select", {
            options: [{ id: "done", name: "Done", color: "green" }],
          })}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    const optionInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Done option name"]'
    )
    await act(async () => {
      optionInput?.focus()
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(optionInput, "Completed")
      optionInput?.dispatchEvent(new Event("input", { bubbles: true }))
      optionInput?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
      await Promise.resolve()
    })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(optionInput?.value).toBe("Done")
  })

  it("restores Select options when the Base mutation fails", async () => {
    const onUpdate = vi.fn(() => Promise.reject(new Error("write failed")))
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("select", {
            options: [{ id: "done", name: "Done", color: "green" }],
          })}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Delete Done"]')
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(
      container.querySelector('input[aria-label="Done option name"]')
    ).toBeTruthy()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "write failed"
    )
  })

  it("requires an explicit apply step before converting stored values", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("select")}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    const typeTrigger = container.querySelector<HTMLElement>(
      'button[role="combobox"]'
    )
    await act(async () => {
      typeTrigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
      await Promise.resolve()
    })
    const numberOption = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent === "Number")
    expect(numberOption).toBeTruthy()
    await act(async () => {
      numberOption?.click()
      await Promise.resolve()
    })

    expect(onUpdate).not.toHaveBeenCalled()
    const apply = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Apply type"
    )
    expect(apply).toBeTruthy()
    await act(async () => {
      apply?.click()
      await Promise.resolve()
    })
    expect(onUpdate).toHaveBeenCalledWith(expect.any(Object), {
      type: "number",
    })
  })

  it("preserves a failed type conversion for an in-place retry", async () => {
    const onUpdate = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unable to convert field"))
      .mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("select")}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    await act(async () => {
      container
        .querySelector<HTMLElement>('button[role="combobox"]')
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        )
      await Promise.resolve()
    })
    const numberOption = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent === "Number")
    await act(async () => {
      numberOption?.click()
      await Promise.resolve()
    })
    const applyType = () =>
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Apply type"
      )
    await act(async () => {
      applyType()?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Unable to convert field"
    )
    expect(applyType()).toBeTruthy()

    await act(async () => {
      applyType()?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(applyType()).toBeUndefined()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it("persists the number bar presentation from the same side panel", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("number")}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "bar")
        ?.click()
      await Promise.resolve()
    })

    expect(onUpdate).toHaveBeenCalledWith(expect.any(Object), {
      property: {
        format: "number",
        showAs: "bar",
        color: "purple",
        divideBy: 100,
        showNumber: true,
      },
    })
  })

  it("cancels an inline Number maximum edit with Escape", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("number", {
            format: "number",
            showAs: "bar",
            color: "purple",
            divideBy: 100,
            showNumber: true,
          })}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    const maximumInput = container.querySelector<HTMLInputElement>(
      'input[inputmode="decimal"]'
    )
    await act(async () => {
      maximumInput?.focus()
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(maximumInput, "250")
      maximumInput?.dispatchEvent(new Event("input", { bubbles: true }))
      maximumInput?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
      await Promise.resolve()
    })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(maximumInput?.value).toBe("100")
  })

  it("restores Number display settings when the Base mutation fails", async () => {
    const onUpdate = vi.fn(() => Promise.reject(new Error("write failed")))
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={field("number")}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "bar")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain("Bar maximum")
  })

  it("shows immutable system field types without an empty selector", async () => {
    await act(async () => {
      root.render(
        <BaseFieldPropertyPanel
          field={{
            ...field("text"),
            name: "Title",
            type: "title",
            tableColumnName: "title",
            valueKind: "system",
          }}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      )
    })

    expect(container.textContent).toContain("title")
    expect(container.textContent).not.toContain("Delete field")
  })
})
