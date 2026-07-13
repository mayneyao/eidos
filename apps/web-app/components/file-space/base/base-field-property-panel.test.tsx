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
