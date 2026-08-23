import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { vi } from "vitest"

import type { EidosFileEditorDataSource } from "./data-source"
import { EidosFileFieldCreatePopover } from "./eidos-file-field-create-popover"
import {
  EidosFileFormModeToolbar,
  EidosFileFormView,
} from "./eidos-file-form-view"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const now = "2026-08-23T00:00:00.000Z"
const nameField: EidosFileFieldInfo = {
  id: "name",
  tableId: "contacts",
  name: "Name",
  type: "text",
  tableName: "Contacts",
  tableColumnName: "Name",
  physicalName: "Name",
  nullable: false,
  position: 0,
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}
const emailField: EidosFileFieldInfo = {
  ...nameField,
  id: "email",
  name: "Email",
  tableColumnName: "Email",
  physicalName: "Email",
  nullable: true,
  position: 1,
}
const view: EidosFileViewInfo = {
  id: "intake",
  name: "Intake",
  type: "form",
  tableId: "contacts",
  query: "",
  properties: {
    title: "Join the list",
    successMessage: "Saved locally.",
  },
  filter: null,
  sorts: [],
  orderMap: null,
  hiddenFields: ["email"],
  position: 0,
  createdAt: now,
  updatedAt: now,
}
const table: EidosFileTableSnapshot = {
  table: {
    id: "contacts",
    name: "Contacts",
    rawTableName: "tb_contacts",
    position: 0,
    icon: null,
    description: null,
    createdAt: now,
    updatedAt: now,
  },
  fields: [nameField, emailField],
  views: [view],
  rowCount: 0,
}
const snapshot: EidosFileSnapshot = {
  path: "contacts.eidos",
  metadata: {
    format: "eidos-file",
    fileId: "0198c72d-82b5-7968-b163-98be4b7477df",
    formatVersion: "1.0",
    schemaVersion: 1,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  },
  tables: [table],
}

function createSource(): EidosFileEditorDataSource {
  return {
    getSnapshot: vi.fn(async () => snapshot),
    getPage: vi.fn(async (_tableId, offset, limit) => ({
      tableId: "contacts",
      offset,
      limit,
      total: 0,
      rows: [],
    })),
    calculateColumnStats: vi.fn(async () => []),
    insertRow: vi.fn(async (_tableId, values) => ({
      tableId: "contacts",
      row: { _id: "row-1", Name: values.name },
      rowCount: 1,
    })),
    updateRow: vi.fn(),
    deleteRowRanges: vi.fn(),
    deleteRows: vi.fn(),
    updateField: vi.fn(),
    addField: vi.fn(),
    deleteField: vi.fn(),
    createTable: vi.fn(),
    updateTable: vi.fn(),
    deleteTable: vi.fn(),
    createView: vi.fn(),
    duplicateView: vi.fn(),
    deleteView: vi.fn(),
    reorderViews: vi.fn(),
    updateView: vi.fn(async () => snapshot),
  }
}

describe("EidosFileFormView", () => {
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

  it("exposes the builder and preview modes as a compact workbar control", () => {
    const onModeChange = vi.fn()
    act(() => {
      root.render(
        <EidosFileFormModeToolbar mode="build" onModeChange={onModeChange} />
      )
    })

    const toolbar = container.querySelector(
      "[data-eidos-file-form-mode-toolbar]"
    )
    expect(toolbar?.getAttribute("role")).toBe("group")
    expect(
      Array.from(toolbar?.querySelectorAll("button") ?? [], (button) => ({
        label: button.textContent?.trim(),
        pressed: button.getAttribute("aria-pressed"),
        stableWeight: button.classList.contains("font-medium"),
      }))
    ).toEqual([
      { label: "Build", pressed: "true", stableWeight: true },
      { label: "Preview", pressed: "false", stableWeight: true },
    ])

    act(() => {
      Array.from(toolbar?.querySelectorAll("button") ?? [])
        .find((button) => button.textContent?.trim() === "Preview")
        ?.click()
    })
    expect(onModeChange).toHaveBeenCalledWith("preview")
  })

  it("edits the form inline from a canvas-first builder", async () => {
    const source = createSource()
    act(() => {
      root.render(
        <EidosFileFormView
          source={source}
          table={table}
          view={view}
          query={{}}
          search=""
          disabled={false}
          reloadToken={0}
          commands={[]}
          selection={{ rowIds: [] }}
          state={{}}
          capabilities={{
            read: true,
            mutate: true,
            resolveAssets: true,
            rawFile: false,
            nativeFileSystem: false,
          }}
        />
      )
    })

    expect(container.querySelector("aside")).toBeNull()
    expect(
      container.querySelector('main[aria-label="Form builder"]')
    ).not.toBeNull()
    expect(
      container.querySelector('button[aria-label="Form options"]')
    ).toBeNull()
    expect(
      container.querySelector("[data-eidos-file-form-mode-toolbar]")
    ).toBeNull()
    expect(
      container.querySelector('[data-eidos-file-form-block="name"]')
    ).not.toBeNull()
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Name"]')
        ?.disabled
    ).toBe(true)

    const title = container.querySelector<HTMLDivElement>(
      '[contenteditable="true"][aria-label="Form title"]'
    )
    expect(title).not.toBeNull()
    const submitLabel = container.querySelector<HTMLDivElement>(
      '[contenteditable="true"][aria-label="Submit label"]'
    )
    const successMessage = container.querySelector<HTMLDivElement>(
      '[contenteditable="true"][aria-label="Success message"]'
    )
    expect(submitLabel?.textContent).toBe("Submit")
    expect(successMessage?.textContent).toBe("Saved locally.")
    await act(async () => {
      title!.focus()
      title!.textContent = "Customer intake"
      title!.blur()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      submitLabel!.focus()
      submitLabel!.textContent = "Join"
      submitLabel!.blur()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      successMessage!.focus()
      successMessage!.textContent = "You're in."
      successMessage!.blur()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(source.updateView).toHaveBeenCalledWith("intake", {
      properties: expect.objectContaining({
        title: "Customer intake",
        submitLabel: "Join",
        successMessage: "You're in.",
        fields: expect.arrayContaining([
          expect.objectContaining({ fieldId: "name", required: true }),
          expect.objectContaining({ fieldId: "email", required: false }),
        ]),
      }),
    })
  })

  it("validates an interactive preview without writing a local row", async () => {
    const source = createSource()
    act(() => {
      root.render(
        <EidosFileFormView
          source={source}
          table={table}
          view={view}
          query={{}}
          search=""
          disabled={false}
          reloadToken={0}
          commands={[]}
          selection={{ rowIds: [] }}
          state={{ formMode: "preview" }}
          capabilities={{
            read: true,
            mutate: true,
            resolveAssets: true,
            rawFile: false,
            nativeFileSystem: false,
          }}
        />
      )
    })

    expect(container.textContent).toContain("Preview responses are not saved.")

    const submit = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Submit"
    )
    expect(submit).toBeDefined()
    act(() => submit!.click())
    expect(container.textContent).toContain("This field is required.")
    expect(source.insertRow).not.toHaveBeenCalled()

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Name"]'
    )
    expect(input).not.toBeNull()
    await act(async () => {
      input!.focus()
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(input, "Ada")
      input!.dispatchEvent(new Event("input", { bubbles: true }))
      input!.blur()
      await Promise.resolve()
    })
    await act(async () => {
      submit!.click()
      await Promise.resolve()
    })

    expect(source.insertRow).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Saved locally.")
  })

  it("restores hidden fields at a chosen canvas position", async () => {
    const source = createSource()
    const onFieldAdd = vi.fn()
    act(() => {
      root.render(
        <EidosFileFormView
          source={source}
          table={table}
          view={view}
          query={{}}
          search=""
          disabled={false}
          reloadToken={0}
          commands={[]}
          selection={{ rowIds: [] }}
          state={{}}
          onFieldAdd={onFieldAdd}
          capabilities={{
            read: true,
            mutate: true,
            resolveAssets: true,
            rawFile: false,
            nativeFileSystem: false,
          }}
        />
      )
    })

    const addQuestion = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add question"]'
    )
    expect(addQuestion).not.toBeNull()
    await act(async () => {
      addQuestion!.click()
      await Promise.resolve()
    })

    const hiddenEmail = Array.from(
      document.body.querySelectorAll("button")
    ).find((button) => button.textContent?.trim().startsWith("Email"))
    expect(hiddenEmail).toBeDefined()
    await act(async () => {
      hiddenEmail!.click()
      await Promise.resolve()
    })
    expect(source.updateView).toHaveBeenCalledWith("intake", {
      hiddenFields: [],
      orderMap: { name: 0, email: 1 },
    })

    await act(async () => {
      addQuestion!.click()
      await Promise.resolve()
    })
    act(() => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Create table field"))
        ?.click()
    })
    expect(onFieldAdd).toHaveBeenCalledWith(
      1,
      expect.arrayContaining(["text", "select", "file"])
    )
  })

  it("keeps the field creator open after handing off from the insert menu", async () => {
    const source = createSource()

    function FormWithFieldCreator() {
      const [fieldCreatorOpen, setFieldCreatorOpen] = React.useState(false)

      return (
        <>
          <EidosFileFormView
            source={source}
            table={table}
            view={view}
            query={{}}
            search=""
            disabled={false}
            reloadToken={0}
            commands={[]}
            selection={{ rowIds: [] }}
            state={{}}
            onFieldAdd={() => setFieldCreatorOpen(true)}
            capabilities={{
              read: true,
              mutate: true,
              resolveAssets: true,
              rawFile: false,
              nativeFileSystem: false,
            }}
          />
          <EidosFileFieldCreatePopover
            open={fieldCreatorOpen}
            onOpenChange={setFieldCreatorOpen}
            table={table}
            tables={[table]}
            onCreate={vi.fn()}
          />
        </>
      )
    }

    act(() => root.render(<FormWithFieldCreator />))

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add question"]')
        ?.click()
      await Promise.resolve()
    })
    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Create table field"))
        ?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(
      document.body.querySelector('[data-eidos-file-field-create="true"]')
    ).not.toBeNull()
  })

  it("opens question settings from the selected canvas block", async () => {
    const source = createSource()
    act(() => {
      root.render(
        <EidosFileFormView
          source={source}
          table={table}
          view={view}
          query={{}}
          search=""
          disabled={false}
          reloadToken={0}
          commands={[]}
          selection={{ rowIds: [] }}
          state={{}}
          capabilities={{
            read: true,
            mutate: true,
            resolveAssets: true,
            rawFile: false,
            nativeFileSystem: false,
          }}
        />
      )
    })

    const options = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Question options for Name"]'
    )
    expect(options).not.toBeNull()
    await act(async () => {
      options!.click()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain("Question options")
    expect(document.body.textContent).toContain("Linked table field: Name")
    expect(document.body.textContent).toContain("Question type")
    const longText = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Use long text for Name"]'
    )
    expect(longText).not.toBeNull()
    await act(async () => {
      longText!.click()
      await Promise.resolve()
    })
    expect(source.updateView).toHaveBeenCalledWith("intake", {
      properties: expect.objectContaining({
        fields: expect.arrayContaining([
          expect.objectContaining({
            fieldId: "name",
            multiline: true,
          }),
        ]),
      }),
    })
    expect(
      container
        .querySelector('[data-eidos-file-form-block="name"]')
        ?.className.includes("border-primary")
    ).toBe(true)
  })

  it("allows a non-null attachment question to be optional", async () => {
    const source = createSource()
    const attachmentField: EidosFileFieldInfo = {
      ...nameField,
      id: "screenshot",
      name: "Screenshot",
      type: "file",
      tableColumnName: "Screenshot",
      physicalName: "Screenshot",
      nullable: false,
      position: 2,
      storageCodec: "json_array",
    }
    act(() => {
      root.render(
        <EidosFileFormView
          source={source}
          table={{ ...table, fields: [...table.fields, attachmentField] }}
          view={{
            ...view,
            properties: {
              ...view.properties,
              fields: [
                { fieldId: "name", required: true },
                { fieldId: "email", required: false },
                { fieldId: "screenshot", required: true },
              ],
            },
          }}
          query={{}}
          search=""
          disabled={false}
          reloadToken={0}
          commands={[]}
          selection={{ rowIds: [] }}
          state={{}}
          capabilities={{
            read: true,
            mutate: true,
            resolveAssets: true,
            rawFile: false,
            nativeFileSystem: false,
          }}
        />
      )
    })

    const options = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Question options for Screenshot"]'
    )
    expect(options).not.toBeNull()
    await act(async () => {
      options!.click()
      await Promise.resolve()
    })
    const required = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Require Screenshot"]'
    )
    expect(required).not.toBeNull()
    expect(required?.disabled).toBe(false)
    await act(async () => {
      required!.click()
      await Promise.resolve()
    })
    expect(source.updateView).toHaveBeenCalledWith("intake", {
      properties: expect.objectContaining({
        fields: expect.arrayContaining([
          expect.objectContaining({
            fieldId: "screenshot",
            required: false,
          }),
        ]),
      }),
    })
  })

  it("renders configured long text questions as multiline controls", () => {
    const source = createSource()
    act(() => {
      root.render(
        <EidosFileFormView
          source={source}
          table={table}
          view={{
            ...view,
            properties: {
              ...view.properties,
              fields: [{ fieldId: "name", required: true, multiline: true }],
            },
          }}
          query={{}}
          search=""
          disabled={false}
          reloadToken={0}
          commands={[]}
          selection={{ rowIds: [] }}
          state={{}}
          capabilities={{
            read: true,
            mutate: true,
            resolveAssets: true,
            rawFile: false,
            nativeFileSystem: false,
          }}
        />
      )
    })

    expect(
      container.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Name"]'
      )?.rows
    ).toBe(4)
  })
})
