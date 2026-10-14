// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { SpacePropertiesPanel } from "./space-properties-panel"
import {
  DEFAULT_SPACE_PROPERTY_SCHEMA,
  spacePropertyEditorField,
  type SpacePropertySelection,
} from "../shared/space-properties"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
let container: HTMLDivElement
let view: ReturnType<typeof createRoot>
const selection = (path: string, rating: number): SpacePropertySelection => ({
  schema: {
    version: 1,
    fields: [
      ...DEFAULT_SPACE_PROPERTY_SCHEMA.fields.filter(
        (field) => field.key !== "rating"
      ),
      { key: "rating", type: "number" },
    ],
  },
  entries: [{ path, kind: "file", values: { rating } }],
})
beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement("div")
  document.body.append(container)
  view = createRoot(container)
})
afterEach(async () => {
  await act(async () => view.unmount())
  container.remove()
  vi.useRealTimers()
})
const props = {
  disabled: false,
  onManage: vi.fn(),
  onClose: vi.fn(),
}
async function flush() {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync()
  })
}

it("discards an obsolete selection response after switching files", async () => {
  let resolveOld!: (value: SpacePropertySelection) => void
  Object.assign(window, {
    eidosLite: {
      readEntryProperties: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveOld = resolve
            })
        )
        .mockResolvedValueOnce(selection("b.txt", 5)),
    },
  })
  await act(async () =>
    view.render(<SpacePropertiesPanel {...props} paths={["a.txt"]} />)
  )
  await flush()
  await act(async () =>
    view.render(<SpacePropertiesPanel {...props} paths={["b.txt"]} />)
  )
  await flush()
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="rating"]')?.value
  ).toBe("5")
  await act(async () => resolveOld(selection("a.txt", 1)))
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="rating"]')?.value
  ).toBe("5")
})

it("shows mixed values and retains a failed batch edit for retry", async () => {
  const data: SpacePropertySelection = {
    schema: selection("a.txt", 1).schema,
    entries: [
      ...selection("a.txt", 1).entries,
      ...selection("b.txt", 5).entries,
    ],
  }
  const patch = vi
    .fn()
    .mockResolvedValueOnce({
      updated: ["a.txt"],
      errors: [{ path: "b.txt", message: "read-only filesystem" }],
    })
    .mockResolvedValueOnce({ updated: ["a.txt", "b.txt"], errors: [] })
  const partiallyUpdated = {
    ...data,
    entries: [
      ...selection("a.txt", 4).entries,
      ...selection("b.txt", 5).entries,
    ],
  }
  const fullyUpdated = {
    ...data,
    entries: [
      ...selection("a.txt", 4).entries,
      ...selection("b.txt", 4).entries,
    ],
  }
  Object.assign(window, {
    eidosLite: {
      readEntryProperties: vi
        .fn()
        .mockResolvedValueOnce(data)
        .mockResolvedValueOnce(partiallyUpdated)
        .mockResolvedValueOnce(fullyUpdated),
      patchEntryProperties: patch,
    },
  })
  await act(async () =>
    view.render(<SpacePropertiesPanel {...props} paths={["a.txt", "b.txt"]} />)
  )
  await flush()
  const input = container.querySelector<HTMLInputElement>(
    '[aria-label="rating"]'
  )!
  expect(input.placeholder).toBe("Mixed values")
  await act(async () => {
    input.focus()
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "4")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  )
  expect(patch).toHaveBeenCalledWith(["a.txt", "b.txt"], { set: { rating: 4 } })
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "b.txt: read-only filesystem"
  )
  expect(input.value).toBe("4")
  expect(
    Array.from(container.querySelectorAll("button")).some(
      (button) => button.textContent === "Discard change"
    )
  ).toBe(true)
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(".properties-retry button")!
      .click()
  )
  expect(patch).toHaveBeenCalledTimes(2)
  expect(patch).toHaveBeenLastCalledWith(["a.txt", "b.txt"], {
    set: { rating: 4 },
  })
  expect(input.value).toBe("4")
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.querySelector(".properties-retry")).toBeNull()
})

it("uses canonical option colors and the shared record field controls", async () => {
  const definition = { key: "tags", type: "tags" as const, options: ["Work"] }
  const field = spacePropertyEditorField(definition)
  field.property = { options: [{ name: "Work", color: "green" }] }
  const data: SpacePropertySelection = {
    schema: { version: 1, fields: [{ ...definition, field }] },
    entries: [{ path: "docs", kind: "directory", values: { tags: ["Work"] } }],
  }
  const patch = vi.fn().mockResolvedValue({ updated: ["docs"], errors: [] })
  Object.assign(window, {
    eidosLite: {
      readEntryProperties: vi.fn().mockResolvedValue(data),
      patchEntryProperties: patch,
    },
  })
  await act(async () =>
    view.render(
      <SpacePropertiesPanel {...props} theme="dark" paths={["docs"]} />
    )
  )
  await flush()
  expect(
    container.querySelector('[data-eidos-file-field-type-icon="multi-select"]')
  ).toBeTruthy()
  const chip = container.querySelector<HTMLElement>(
    '[data-eidos-file-option-color="green"]'
  )!
  expect(chip.textContent).toBe("Work")
  expect(chip.style.backgroundColor).toBe("rgb(35, 86, 59)")
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="tags"]')!
      .click()
  )
  const option = document.body.querySelector<HTMLElement>(
    '[role="dialog"] [data-eidos-file-option-color="green"]'
  )!
  await act(async () => option.closest<HTMLButtonElement>("button")!.click())
  expect(patch).toHaveBeenCalledWith(["docs"], { set: { tags: [] } })
})

it("adds unconfigured tags through the shared picker and clears native values", async () => {
  const data = selection("a.txt", 1)
  const patch = vi.fn().mockResolvedValue({ updated: ["a.txt"], errors: [] })
  Object.assign(window, {
    eidosLite: {
      readEntryProperties: vi.fn().mockResolvedValue(data),
      patchEntryProperties: patch,
    },
  })
  await act(async () =>
    view.render(<SpacePropertiesPanel {...props} paths={["a.txt"]} />)
  )
  await flush()
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="tags"]')!
      .click()
  )
  const input = document.body.querySelector<HTMLInputElement>(
    '[aria-label="Add option"]'
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "Work")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  )
  expect(patch).toHaveBeenCalledWith(["a.txt"], { set: { tags: ["Work"] } })
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  )
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Clear property rating"]')!
      .click()
  )
  expect(patch).toHaveBeenLastCalledWith(["a.txt"], { remove: ["rating"] })
})

it("offers folder management for a directory and forwards its scope", async () => {
  const data = selection("docs", 4)
  data.entries[0]!.kind = "directory"
  Object.assign(window, {
    eidosLite: { readEntryProperties: vi.fn().mockResolvedValue(data) },
  })
  await act(async () =>
    view.render(<SpacePropertiesPanel {...props} paths={["docs"]} />)
  )
  await flush()
  const manage = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Manage folder properties")
  )!
  await act(async () => manage.click())
  expect(props.onManage).toHaveBeenCalledWith("docs")
})
