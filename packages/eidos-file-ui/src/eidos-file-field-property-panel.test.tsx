// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileTableSnapshot,
  UpdateEidosFileFieldInput,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileFieldPropertyPanel } from "./eidos-file-field-property-panel"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
})

function field(
  type: EidosFileFieldInfo["type"],
  property: Record<string, unknown> | null = null
): EidosFileFieldInfo {
  return {
    id:
      type === "select"
        ? "0198c72d-82b5-7000-8000-000000000001"
        : "0198c72d-82b5-7000-8000-000000000002",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
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

function table(
  id: string,
  name: string,
  fields: EidosFileFieldInfo[] = []
): EidosFileTableSnapshot {
  return {
    table: {
      id,
      name,
      rawTableName: `tb_${name.toLowerCase()}`,
      position: 0,
      icon: null,
      description: null,
      createdAt: "",
      updatedAt: "",
    },
    fields,
    views: [],
    rowCount: 0,
  }
}

describe("EidosFileFieldPropertyPanel", () => {
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
      (
        field: EidosFileFieldInfo,
        changes: UpdateEidosFileFieldInput
      ) => Promise<void>
    >(() => Promise.resolve())
    await act(async () => {
      root.render(
        <EidosFileFieldPropertyPanel
          field={field("select")}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    expect(
      container.querySelector('[data-eidos-file-detail-panel="field"]')
        ?.classList
    ).toContain("eidos-file-detail-panel")
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
        (
          field: EidosFileFieldInfo,
          changes: UpdateEidosFileFieldInput
        ) => Promise<void>
      >()
      .mockRejectedValueOnce(new Error("Unable to rename field"))
      .mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <EidosFileFieldPropertyPanel
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
        <EidosFileFieldPropertyPanel
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
        <EidosFileFieldPropertyPanel
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
        <EidosFileFieldPropertyPanel
          field={field("select", {
            options: [
              { name: "Todo", color: "blue" },
              { name: "Done", color: "green" },
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
        options: [{ name: "Done", color: "green" }],
      },
    })
  })

  it("keeps option values unique when editing an existing Select field", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <EidosFileFieldPropertyPanel
          field={field("select", {
            options: [
              { name: "Todo", color: "blue" },
              { name: "Done", color: "green" },
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
      'input[aria-label="Done option value"]'
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

  it("persists a direct option value rename with its cell rewrite mapping", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <EidosFileFieldPropertyPanel
          field={field("select", {
            options: [{ name: "Done", color: "green" }],
          })}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    const optionInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Done option value"]'
    )
    await act(async () => {
      if (optionInput) {
        optionInput.focus()
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set?.call(optionInput, "Complete")
        optionInput.dispatchEvent(new Event("input", { bubbles: true }))
        optionInput.blur()
      }
      await Promise.resolve()
    })

    expect(onUpdate).toHaveBeenCalledWith(expect.any(Object), {
      property: { options: [{ name: "Complete", color: "green" }] },
      optionValueChanges: [{ from: "Done", to: "Complete" }],
    })
  })

  it("cancels an inline Select option rename with Escape", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <EidosFileFieldPropertyPanel
          field={field("select", {
            options: [{ name: "Done", color: "green" }],
          })}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      )
    })

    const optionInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Done option value"]'
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

  it("restores Select options when the Eidos File mutation fails", async () => {
    const onUpdate = vi.fn(() => Promise.reject(new Error("write failed")))
    await act(async () => {
      root.render(
        <EidosFileFieldPropertyPanel
          field={field("select", {
            options: [{ name: "Done", color: "green" }],
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
      container.querySelector('input[aria-label="Done option value"]')
    ).toBeTruthy()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "write failed"
    )
  })

  it("requires an explicit apply step before converting stored values", async () => {
    const onUpdate = vi.fn(() => Promise.resolve())
    await act(async () => {
      root.render(
        <EidosFileFieldPropertyPanel
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
        <EidosFileFieldPropertyPanel
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
        <EidosFileFieldPropertyPanel
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
        <EidosFileFieldPropertyPanel
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

  it("restores Number display settings when the Eidos File mutation fails", async () => {
    const onUpdate = vi.fn(() => Promise.reject(new Error("write failed")))
    await act(async () => {
      root.render(
        <EidosFileFieldPropertyPanel
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
        <EidosFileFieldPropertyPanel
          field={{
            ...field("text"),
            name: "Row ID",
            type: "row-id",
            tableColumnName: "_id",
            valueKind: "system",
          }}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      )
    })

    expect(container.textContent).toContain("row id")
    expect(container.textContent).not.toContain("Delete field")
  })

  it("shows a Relation target by table name and keeps identifiers collapsed", async () => {
    const targetTableId = "0198c72d-82b5-7000-8000-000000000020"
    const relation = {
      ...field("relation", {
        targetTableId,
        cardinality: "many",
      }),
      name: "People",
      tableColumnName: "0198c72d-82b5-7000-8000-000000000002",
      storageCodec: "relation" as const,
      valueKind: "relation" as const,
    }
    await act(async () => {
      root.render(
        <EidosFileFieldPropertyPanel
          field={relation}
          tables={[
            table(relation.tableId, "Projects", [relation]),
            table(targetTableId, "Contacts"),
          ]}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      )
    })

    const summary = container.querySelector(
      "[data-eidos-file-relation-summary]"
    )
    expect(summary?.textContent).toContain("Contacts")
    expect(summary?.textContent).toContain("Links to multiple records")
    expect(summary?.textContent).not.toContain(targetTableId)
    expect(
      container.querySelector<HTMLDetailsElement>(
        "[data-eidos-file-technical-details]"
      )?.open
    ).toBe(false)
  })

  it("summarizes a Lookup with Relation and target field names", async () => {
    const targetTableId = "0198c72d-82b5-7000-8000-000000000020"
    const relation = {
      ...field("relation", { targetTableId }),
      id: "0198c72d-82b5-7000-8000-000000000021",
      name: "Owner",
      storageCodec: "relation" as const,
      valueKind: "relation" as const,
    }
    const target = {
      ...field("text"),
      id: "0198c72d-82b5-7000-8000-000000000022",
      tableId: targetTableId,
      name: "Name",
    }
    const lookup = {
      ...field("lookup", {
        relationField: relation.id,
        targetField: target.id,
        aggregate: "first",
      }),
      name: "Owner name",
      storageCodec: "scalar" as const,
      valueKind: "derived" as const,
      isDerived: true,
    }
    await act(async () => {
      root.render(
        <EidosFileFieldPropertyPanel
          field={lookup}
          tables={[
            table(lookup.tableId, "Projects", [relation, lookup]),
            table(targetTableId, "Contacts", [target]),
          ]}
          disabled={false}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          onEditLookup={vi.fn()}
        />
      )
    })

    const summary = container.querySelector("[data-eidos-file-lookup-summary]")
    expect(summary?.textContent).toContain("Owner")
    expect(summary?.textContent).toContain("Name")
    expect(summary?.textContent).toContain("First value")
    expect(summary?.textContent).not.toContain(relation.id)
    expect(summary?.textContent).not.toContain(target.id)
  })
})
