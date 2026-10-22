// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"

import { EidosFileUIProvider } from "./context"
import { EidosFileRecordFieldEditor } from "./eidos-file-record-field-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function optionField(type: "select" | "multi-select"): EidosFileFieldInfo {
  return {
    id: `field-${type}`,
    tableId: "table-tasks",
    name: type === "select" ? "Status" : "Tags",
    type,
    tableName: "tasks",
    tableColumnName: type === "select" ? "status" : "tags",
    property: {
      options: [
        { name: "Todo", color: "blue" },
        { name: "Done", color: "green" },
      ],
    },
    storageCodec: type === "select" ? "scalar" : "json_array",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

function datetimeField(): EidosFileFieldInfo {
  return {
    ...optionField("select"),
    id: "field-scheduled-at",
    name: "Scheduled at",
    type: "datetime",
    tableColumnName: "scheduled_at",
    property: null,
  }
}

function checkboxField(nullable: boolean): EidosFileFieldInfo {
  return {
    ...optionField("select"),
    id: "field-done",
    name: "Done",
    type: "checkbox",
    tableColumnName: "done",
    property: null,
    nullable,
  }
}

function numberField(): EidosFileFieldInfo {
  return {
    ...optionField("select"),
    id: "field-score",
    name: "Score",
    type: "number",
    tableColumnName: "score",
    property: null,
  }
}

function ratingField(): EidosFileFieldInfo {
  return {
    ...numberField(),
    id: "field-rating",
    name: "Rating",
    type: "rating",
    tableColumnName: "rating",
    settings: { max: 5 },
  }
}

function enterInputValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set?.call(element, value)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("EidosFileRecordFieldEditor option presentation", () => {
  it("allows a mobile record title to wrap instead of clipping to one line", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    try {
      await act(async () =>
        root.render(
          <EidosFileUIProvider interactionMode="mobile">
            <EidosFileRecordFieldEditor
              field={{ ...numberField(), type: "text" }}
              row={{ score: "很长的移动端记录标题" }}
              appearance="record-title"
              disabled={false}
              onChange={vi.fn()}
            />
          </EidosFileUIProvider>
        )
      )
      const title = host.querySelector("textarea")!
      expect(title.style.maxHeight).not.toBe("1lh")
      expect(title.className).toContain("[overflow-wrap:anywhere]")
    } finally {
      await act(async () => root.unmount())
    }
  })
  it("moves from the title on Enter while preserving Shift+Enter and IME confirmation", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const onEnter = vi.fn()
    try {
      await act(async () =>
        root.render(
          <EidosFileRecordFieldEditor
            field={{ ...numberField(), type: "text" }}
            row={{ score: "Title" }}
            appearance="record-title"
            disabled={false}
            onChange={vi.fn()}
            onEnter={onEnter}
          />
        )
      )
      const title = host.querySelector("textarea")!
      for (const options of [
        { shiftKey: true },
        { isComposing: true },
        { keyCode: 229 },
      ]) {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
          ...options,
        })
        await act(async () => {
          title.dispatchEvent(event)
        })
        expect(event.defaultPrevented).toBe(false)
      }
      expect(onEnter).not.toHaveBeenCalled()
      title.focus()
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
      await act(async () => {
        title.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(true)
      expect(onEnter).toHaveBeenCalledOnce()
      expect(document.activeElement).not.toBe(title)
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("uses a direct checkbox without a clear action in compact forms", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    const render = async (done: number | null) => {
      await act(async () => {
        root.render(
          <EidosFileRecordFieldEditor
            field={checkboxField(true)}
            row={{ done }}
            appearance="compact"
            disabled={false}
            onChange={onChange}
          />
        )
      })
    }
    await render(null)
    const checkbox = () =>
      container.querySelector<HTMLButtonElement>('[role="checkbox"]')!
    expect(checkbox().getAttribute("aria-checked")).toBe("mixed")
    expect(container.querySelector('[role="combobox"]')).toBeNull()
    await act(async () => checkbox().click())
    expect(onChange).toHaveBeenLastCalledWith(1)
    await render(1)
    expect(checkbox().getAttribute("aria-checked")).toBe("true")
    expect(container.querySelector('[aria-label="Clear"]')).toBeNull()
    await act(async () => checkbox().click())
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it("creates and selects a single option, closes on success, and reuses existing names", async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const change = vi.fn().mockResolvedValue(undefined)
    await act(async () =>
      root.render(
        <EidosFileRecordFieldEditor
          field={optionField("select")}
          row={{ status: "Todo" }}
          appearance="compact"
          disabled={false}
          onChange={change}
          onCreateOption={create}
        />
      )
    )
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Status"]'
    )!
    await act(async () => trigger.click())
    let input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search or create an option…"]'
    )!
    await act(async () => enterInputValue(input, "New status"))
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    )
    expect(create).toHaveBeenCalledWith("New status")
    expect(
      document.querySelector('input[aria-label="Search or create an option…"]')
    ).toBeNull()
    await act(async () => trigger.click())
    input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search or create an option…"]'
    )!
    await act(async () => enterInputValue(input, "Done"))
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    )
    expect(change).toHaveBeenCalledWith("Done")
    expect(create).toHaveBeenCalledTimes(1)
    expect(
      document.querySelector('input[aria-label="Search or create an option…"]')
    ).toBeNull()
  })

  it("creates from an empty multi-select and keeps the draft retryable after a failure", async () => {
    let reject!: (error: Error) => void
    const create = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, fail) => {
            reject = fail
          })
      )
      .mockResolvedValue(undefined)
    await act(async () =>
      root.render(
        <EidosFileRecordFieldEditor
          field={{ ...optionField("multi-select"), property: { options: [] } }}
          row={{ tags: null }}
          appearance="compact"
          disabled={false}
          onChange={vi.fn()}
          onCreateOption={create}
        />
      )
    )
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Tags"]')!
        .click()
    )
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search or create an option…"]'
    )!
    expect(input).not.toBeNull()
    await act(async () => enterInputValue(input, "  新选项  "))
    const enter = () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    await act(async () => {
      enter()
      enter()
    })
    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith("新选项")
    expect(input.disabled).toBe(false)
    expect(input.readOnly).toBe(true)
    await act(async () => reject(new Error("Cannot write catalog")))
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Cannot write catalog"
    )
    expect(input.value).toBe("  新选项  ")
    await act(async () => enter())
    expect(create).toHaveBeenCalledTimes(2)
    expect(input.value).toBe("")
    expect(document.activeElement).toBe(input)
  })

  it("selects an existing multi-select option by Enter instead of creating a duplicate", async () => {
    const create = vi.fn()
    const change = vi.fn().mockResolvedValue(undefined)
    await act(async () =>
      root.render(
        <EidosFileRecordFieldEditor
          field={optionField("multi-select")}
          row={{ tags: '["Todo"]' }}
          appearance="compact"
          disabled={false}
          onChange={change}
          onCreateOption={create}
        />
      )
    )
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Tags"]')!
        .click()
    )
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search or create an option…"]'
    )!
    await act(async () => enterInputValue(input, "Done"))
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
        })
      )
    )
    expect(change).not.toHaveBeenCalled()
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    )
    expect(create).not.toHaveBeenCalled()
    expect(change).toHaveBeenCalledWith('["Todo","Done"]')
  })

  it("discards an invalid compact numeric draft on Escape without blur revalidating or saving it", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    await act(async () =>
      root.render(
        <EidosFileRecordFieldEditor
          field={numberField()}
          row={{ score: 148.5 }}
          appearance="compact"
          disabled={false}
          onChange={onChange}
        />
      )
    )
    const input = container.querySelector("input")!
    input.focus()
    await act(async () => enterInputValue(input, "abc"))
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
    expect(input.value).toBe("148.5")
    expect(input.getAttribute("aria-invalid")).toBe("false")
    expect(container.textContent).not.toContain("Enter a finite number")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("shows only stars without numeric or clear actions in a compact rating", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    await act(async () =>
      root.render(
        <EidosFileRecordFieldEditor
          field={ratingField()}
          row={{ rating: 3 }}
          appearance="compact"
          disabled={false}
          onChange={onChange}
        />
      )
    )
    expect(container.querySelector("input")).toBeNull()
    expect(
      container
        .querySelector('[aria-label="Rate 3"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true")
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Rate 5"]')!
        .click()
    )
    expect(onChange).toHaveBeenLastCalledWith(5)
    expect(container.querySelector('[aria-label="Clear"]')).toBeNull()
    expect(container.querySelector('[aria-label="Rate 0"]')).toBeNull()
    expect(container.querySelectorAll("button")).toHaveLength(5)
  })

  it("opens the edited URL through the host and hides navigation for unsafe values", async () => {
    const activateUrl = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <EidosFileUIProvider activateUrl={activateUrl}>
          <EidosFileRecordFieldEditor
            field={{ ...numberField(), type: "url" }}
            row={{ score: "https://example.com" }}
            disabled={false}
            onChange={vi.fn()}
          />
        </EidosFileUIProvider>
      )
    })
    const input =
      container.querySelector<HTMLInputElement>('input[type="url"]')!
    await act(async () => {
      enterInputValue(input, "https://example.com/edited")
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open URL"]')!
        .click()
    })
    expect(activateUrl).toHaveBeenCalledWith("https://example.com/edited")
    activateUrl.mockRejectedValue(new Error("Host rejected navigation"))
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open URL"]')!
        .click()
    })
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    for (const value of [
      "",
      "javascript:alert(1)",
      "https://user:secret@example.com",
    ]) {
      await act(async () => enterInputValue(input, value))
      expect(container.querySelector('[aria-label="Open URL"]')).toBeNull()
      expect(container.querySelector('[role="alert"]')).toBeNull()
    }
  })

  it("keeps a single-select option color in its selected value and menu", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={optionField("select")}
          row={{ id: "row-1", status: "Done" }}
          disabled={false}
          onChange={() => Promise.resolve()}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[role="combobox"]'
    )
    expect(
      trigger?.querySelector('[data-eidos-file-option-color="green"]')
    ).toBeTruthy()
    await act(async () => trigger?.click())
    expect(
      document.body.querySelector('[data-eidos-file-option-color="blue"]')
    ).toBeTruthy()
  })

  it("renders every selected multi-select value as a colored option chip", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={optionField("multi-select")}
          row={{ id: "row-1", tags: JSON.stringify(["Todo", "Done"]) }}
          disabled={false}
          onChange={() => Promise.resolve()}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Tags"]'
    )
    expect(
      trigger?.querySelectorAll("[data-eidos-file-option-color]")
    ).toHaveLength(2)
    expect(
      trigger?.querySelector('[data-eidos-file-option-color="blue"]')
    ).toBeTruthy()
    expect(
      trigger?.querySelector('[data-eidos-file-option-color="green"]')
    ).toBeTruthy()
  })

  it("edits nullable Checkbox values without collapsing NULL into false", async () => {
    const onChange = vi.fn(async () => undefined)
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={checkboxField(true)}
          row={{ id: "row-1", done: null }}
          disabled={false}
          onChange={onChange}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Done"]'
    )
    expect(trigger?.textContent).toContain("Empty")
    await act(async () => trigger?.click())
    const checked = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.trim() === "Checked")
    await act(async () => checked?.click())
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it("does not offer NULL for a non-nullable Checkbox", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={checkboxField(false)}
          row={{ id: "row-1", done: 0 }}
          disabled={false}
          onChange={() => Promise.resolve()}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Done"]'
    )
    await act(async () => trigger?.click())
    expect(
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="option"]')
      ).some((option) => option.textContent?.trim() === "Empty")
    ).toBe(false)
  })

  it("preserves an invalid Number draft instead of clearing the Field", async () => {
    const onChange = vi.fn(async () => undefined)
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={numberField()}
          row={{ id: "row-1", score: 12 }}
          disabled={false}
          onChange={onChange}
        />
      )
    })

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Score"]'
    )!
    expect(input.type).toBe("text")
    await act(async () => {
      input.focus()
      enterInputValue(input, "not-a-number")
      input.blur()
      await Promise.resolve()
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe("not-a-number")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(container.textContent).toContain("Enter a finite number.")

    await act(async () => {
      input.focus()
      enterInputValue(input, "12.5")
      input.blur()
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenCalledWith(12.5)
  })

  it.each([true, false])(
    "clears a repeated compact rating with nullable=%s",
    async (nullable) => {
      const onChange = vi.fn(async () => undefined)
      await act(async () => {
        root.render(
          <EidosFileRecordFieldEditor
            field={{ ...ratingField(), nullable }}
            row={{ id: "row-1", rating: 3 }}
            appearance="compact"
            disabled={false}
            onChange={onChange}
          />
        )
      })
      const buttons = container.querySelectorAll<HTMLButtonElement>(
        "button[aria-pressed]"
      )
      await act(async () => buttons[2]!.click())
      expect(onChange).toHaveBeenLastCalledWith(nullable ? null : 0)
      await act(async () => buttons[3]!.click())
      expect(onChange).toHaveBeenLastCalledWith(4)
    }
  )

  it("keeps record Rating edits within the same whole-number range as Grid", async () => {
    const onChange = vi.fn(async () => undefined)
    await act(async () => {
      root.render(
        <EidosFileRecordFieldEditor
          field={ratingField()}
          row={{ id: "row-1", rating: 3 }}
          disabled={false}
          onChange={onChange}
        />
      )
    })

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Rating"]'
    )!
    expect(input.inputMode).toBe("numeric")
    await act(async () => {
      input.focus()
      enterInputValue(input, "3.5")
      input.blur()
      await Promise.resolve()
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain("whole number from 0 to 5")

    await act(async () => {
      input.focus()
      enterInputValue(input, "5")
      input.blur()
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it("edits date-time values in the Host-selected time zone", async () => {
    const onChange = vi.fn(async () => undefined)
    await act(async () => {
      root.render(
        <EidosFileUIProvider timeZone="America/Los_Angeles">
          <EidosFileRecordFieldEditor
            field={datetimeField()}
            row={{
              id: "row-1",
              scheduled_at: "2026-01-01T00:30:00.000Z",
            }}
            disabled={false}
            onChange={onChange}
          />
        </EidosFileUIProvider>
      )
    })

    const input = container.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]'
    )!
    expect(input.value).toBe("2025-12-31T16:30")
    expect(container.textContent).toContain("America/Los_Angeles")
    await act(async () => {
      input.focus()
      enterInputValue(input, "2025-12-31T17:30")
      input.blur()
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenCalledWith("2026-01-01T01:30:00.000Z")
  })
})
