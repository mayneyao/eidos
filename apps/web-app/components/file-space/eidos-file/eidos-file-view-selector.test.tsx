import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"

import { EidosFileViewSelector } from "./eidos-file-view-selector"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

const views: EidosFileViewInfo[] = [
  {
    id: "view_all",
    name: "All tasks",
    type: "grid",
    tableId: "tasks",
    query: "SELECT * FROM tb_tasks",
    properties: null,
    filter: null,
    sorts: [],
    orderMap: null,
    hiddenFields: [],
    position: 1,
    createdAt: "2026-07-12 00:00:00",
    updatedAt: "2026-07-12 00:00:00",
  },
  {
    id: "view_priority",
    name: "By priority",
    type: "grid",
    tableId: "tasks",
    query: "SELECT * FROM tb_tasks",
    properties: null,
    filter: null,
    sorts: [{ field: "priority", direction: "desc" }],
    orderMap: null,
    hiddenFields: [],
    position: 2,
    createdAt: "2026-07-12 00:00:00",
    updatedAt: "2026-07-12 00:00:00",
  },
]

const fields: EidosFileFieldInfo[] = [
  {
    id: "field-status",
    tableId: "tasks",
    name: "Status",
    type: "select",
    tableName: "tb_tasks",
    tableColumnName: "status",
    property: {
      options: [{ value: "todo", color: "blue" }],
    },
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
    id: "field-cover",
    tableId: "tasks",
    name: "Cover",
    type: "file",
    tableName: "tb_tasks",
    tableColumnName: "cover",
    property: null,
    storageCodec: "json_array",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
]

const urlField: EidosFileFieldInfo = {
  ...fields[1],
  id: "field-image-url",
  name: "Image URL",
  type: "url",
  tableColumnName: "image_url",
  storageCodec: "scalar",
}

const galleryView: EidosFileViewInfo = {
  ...views[0],
  id: "view_gallery",
  name: "Task cards",
  type: "gallery",
  properties: { cardSize: "medium", hideEmptyFields: true },
}

const kanbanView: EidosFileViewInfo = {
  ...views[0],
  id: "view_kanban",
  name: "Task board",
  type: "kanban",
  properties: {
    cardSize: "medium",
    coverField: "field-cover",
    fitContent: true,
    groupField: "field-status",
    hideEmptyFields: true,
  },
}

function exactButton(label: string) {
  return Array.from(document.body.querySelectorAll("button"))
    .filter((button) => button.textContent?.trim() === label)
    .at(-1)
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("EidosFileViewSelector", () => {
  let container: HTMLDivElement
  let root: Root
  const onSelect = vi.fn()
  const onCreate = vi.fn()
  const onRename = vi.fn()
  const onDuplicate = vi.fn()
  const onDelete = vi.fn()
  const onReorder = vi.fn()
  const onUpdate = vi.fn()

  beforeEach(() => {
    for (const mock of [
      onSelect,
      onCreate,
      onRename,
      onDuplicate,
      onDelete,
      onReorder,
      onUpdate,
    ]) {
      mock.mockReset()
      mock.mockResolvedValue(undefined)
    }
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <EidosFileViewSelector
          views={views}
          fields={fields}
          activeView={views[0]}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
          onUpdate={onUpdate}
        />
      )
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("switches and creates typed views inside an anchored popover", async () => {
    await act(async () => exactButton("All tasks")?.click())
    await act(async () => exactButton("By priority")?.click())
    expect(onSelect).toHaveBeenCalledWith("view_priority")

    await act(async () => exactButton("All tasks")?.click())
    await act(async () => exactButton("New view")?.click())
    const input = document.body.querySelector<HTMLInputElement>(
      "#eidos-file-view-name"
    )
    expect(input).not.toBeNull()
    await act(async () => {
      if (input) setInput(input, "This week")
    })
    await act(async () => exactButton("Create")?.click())
    expect(onCreate).toHaveBeenCalledWith("This week", "grid")

    await act(async () => exactButton("All tasks")?.click())
    await act(async () => exactButton("New view")?.click())
    await act(async () => exactButton("Gallery")?.click())
    const galleryInput = document.body.querySelector<HTMLInputElement>(
      "#eidos-file-view-name"
    )
    await act(async () => {
      if (galleryInput) setInput(galleryInput, "Task cards")
    })
    await act(async () => exactButton("Create")?.click())
    expect(onCreate).toHaveBeenLastCalledWith("Task cards", "gallery")
  })

  it("opens the create workspace directly from a view-tab add trigger", async () => {
    await act(async () => {
      root.render(
        <EidosFileViewSelector
          views={views}
          fields={fields}
          activeView={views[0]}
          triggerMode="create"
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
          onUpdate={onUpdate}
        />
      )
    })

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Add Eidos File view"]')
        ?.click()
    })

    expect(
      document.body.querySelector<HTMLInputElement>("#eidos-file-view-name")
        ?.value
    ).toBe("Grid 3")
  })

  it("keeps current-view data actions inside the manage-views popover", async () => {
    await act(async () => {
      root.render(
        <EidosFileViewSelector
          views={views}
          fields={fields}
          activeView={views[0]}
          triggerMode="manage"
          viewAction={<button type="button">Export current view as CSV</button>}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
          onUpdate={onUpdate}
        />
      )
    })

    expect(document.body.textContent).not.toContain(
      "Export current view as CSV"
    )
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage Eidos File views"]'
        )
        ?.click()
    })
    expect(document.body.textContent).toContain("Export current view as CSV")
  })

  it("creates a saved view backed by an enabled file extension", async () => {
    await act(async () => {
      root.render(
        <EidosFileViewSelector
          views={views}
          fields={fields}
          activeView={views[0]}
          extensionViews={[
            {
              packageId: "example.tasks",
              contentDigest: `sha256:${"1".repeat(64)}`,
              permissionHash: `sha256:${"2".repeat(64)}`,
              id: "example.tasks.cards",
              displayName: "Task cards",
              description: "Extension cards",
              extensionDisplayName: "Tasks",
            },
          ]}
          triggerMode="create"
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
          onUpdate={onUpdate}
        />
      )
    })
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Add Eidos File view"]')
        ?.click()
    })
    await act(async () => exactButton("Task cardsExtension cards")?.click())
    await act(async () => exactButton("Create")?.click())
    expect(onCreate).toHaveBeenCalledWith(
      "Task cards 1",
      "extension:example.tasks.cards"
    )
  })

  it("uses layout-specific defaults without overwriting a name the user typed", async () => {
    await act(async () => exactButton("All tasks")?.click())
    await act(async () => exactButton("New view")?.click())

    const input = document.body.querySelector<HTMLInputElement>(
      "#eidos-file-view-name"
    )
    expect(input?.value).toBe("Grid 3")

    await act(async () => exactButton("Gallery")?.click())
    expect(input?.value).toBe("Gallery 1")

    await act(async () => {
      if (input) setInput(input, "Grid 99")
    })
    await act(async () => exactButton("Kanban")?.click())
    expect(input?.value).toBe("Grid 99")
  })

  it("renames and duplicates views without structural up/down controls", async () => {
    await act(async () => exactButton("All tasks")?.click())
    expect(
      document.body.querySelector('[aria-label="Reorder By priority view"]')
    ).not.toBeNull()
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage By priority view"]'
        )
        ?.click()
    )
    const input = document.body.querySelector<HTMLInputElement>(
      "#eidos-file-managed-view-name"
    )
    await act(async () => {
      if (!input) return
      setInput(input, "Priority board")
    })
    await act(async () => exactButton("Save")?.click())
    expect(onRename).toHaveBeenCalledWith("view_priority", "Priority board")

    expect(exactButton("Move up")).toBeUndefined()
    expect(exactButton("Move down")).toBeUndefined()
    await act(async () => exactButton("Duplicate view")?.click())
    expect(onDuplicate).toHaveBeenCalledWith("view_priority")
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it("switches an existing view layout in place and initializes Kanban grouping", async () => {
    await act(async () => exactButton("All tasks")?.click())
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage By priority view"]'
        )
        ?.click()
    )

    const layout = document.body.querySelector<HTMLElement>(
      '[role="group"][aria-label="View layout"]'
    )
    expect(layout).not.toBeNull()
    await act(async () => {
      Array.from(layout?.querySelectorAll("button") ?? [])
        .find((button) => button.textContent?.trim() === "Kanban")
        ?.click()
    })

    expect(onUpdate).toHaveBeenCalledWith("view_priority", {
      type: "kanban",
      properties: { groupField: "field-status" },
    })
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it("explains why Kanban layout is unavailable without a Select field", async () => {
    await act(async () => {
      root.render(
        <EidosFileViewSelector
          views={views}
          fields={[fields[1]]}
          activeView={views[0]}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
          onUpdate={onUpdate}
        />
      )
    })
    await act(async () => exactButton("All tasks")?.click())
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage By priority view"]'
        )
        ?.click()
    )

    const kanban = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(
        '[role="group"][aria-label="View layout"] button'
      )
    ).find((button) => button.textContent?.trim() === "Kanban")
    expect(kanban?.disabled).toBe(true)
    expect(document.body.textContent).toContain(
      "Add a Select field to enable Kanban."
    )
  })

  it("confirms view deletion inside the anchored panel", async () => {
    await act(async () => exactButton("All tasks")?.click())
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage By priority view"]'
        )
        ?.click()
    )
    await act(async () => exactButton("Delete view")?.click())
    expect(document.body.textContent).toContain("Delete “By priority”?")
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    await act(async () => exactButton("Delete")?.click())
    expect(onDelete).toHaveBeenCalledWith("view_priority")
  })

  it("configures a File field as the Gallery cover", async () => {
    await act(async () => {
      root.render(
        <EidosFileViewSelector
          views={[galleryView]}
          fields={fields}
          activeView={galleryView}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
          onUpdate={onUpdate}
        />
      )
    })
    await act(async () => exactButton("Task cards")?.click())
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage Task cards view"]'
        )
        ?.click()
    )
    await act(async () => exactButton("No cover")?.click())
    await act(async () => {
      const option = Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="option"]')
      ).find((candidate) => candidate.textContent?.trim() === "Cover")
      option?.click()
    })

    expect(onUpdate).toHaveBeenCalledWith("view_gallery", {
      properties: {
        cardSize: "medium",
        hideEmptyFields: true,
        coverField: "field-cover",
      },
    })
    expect(
      document.body.querySelector(
        '[role="switch"][aria-label="Hide empty fields"]'
      )
    ).not.toBeNull()
    expect(
      document.body.querySelector('[role="group"][aria-label="Card size"]')
    ).not.toBeNull()
    expect(
      document.body
        .querySelector<HTMLButtonElement>(
          '[role="group"][aria-label="Card size"] button[aria-pressed="true"]'
        )
        ?.textContent?.trim()
    ).toBe("medium")
  })

  it("does not treat a URL field as an auto-fetched Gallery cover", async () => {
    await act(async () => {
      root.render(
        <EidosFileViewSelector
          views={[galleryView]}
          fields={[...fields, urlField]}
          activeView={galleryView}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
          onUpdate={onUpdate}
        />
      )
    })
    await act(async () => exactButton("Task cards")?.click())
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage Task cards view"]'
        )
        ?.click()
    )
    await act(async () => exactButton("No cover")?.click())
    expect(
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="option"]')
      ).find((candidate) => candidate.textContent?.trim() === "Image URL")
    ).toBeUndefined()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it("exposes File cover controls for Kanban cards without URL fetching", async () => {
    await act(async () => {
      root.render(
        <EidosFileViewSelector
          views={[kanbanView]}
          fields={[...fields, urlField]}
          activeView={kanbanView}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
          onUpdate={onUpdate}
        />
      )
    })
    await act(async () => exactButton("Task board")?.click())
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage Task board view"]'
        )
        ?.click()
    )

    expect(
      document.body.querySelector('[aria-label="Kanban card cover"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[aria-label="Fit image"]')
    ).not.toBeNull()
    expect(
      document.body.querySelector('[aria-label="Hide empty fields"]')
    ).not.toBeNull()

    await act(async () => exactButton("Cover")?.click())
    expect(
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="option"]')
      ).find((candidate) => candidate.textContent?.trim() === "Image URL")
    ).toBeUndefined()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it("announces a failed view update and keeps its settings available", async () => {
    onUpdate.mockRejectedValueOnce(new Error("Eidos File is read-only"))
    await act(async () => {
      root.render(
        <EidosFileViewSelector
          views={[galleryView]}
          fields={fields}
          activeView={galleryView}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
          onUpdate={onUpdate}
        />
      )
    })
    await act(async () => exactButton("Task cards")?.click())
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage Task cards view"]'
        )
        ?.click()
    )
    await act(async () => {
      exactButton("small")?.click()
      await Promise.resolve()
    })

    expect(onUpdate).toHaveBeenCalledWith("view_gallery", {
      properties: {
        cardSize: "small",
        hideEmptyFields: true,
      },
    })
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "Eidos File is read-only"
    )
    expect(document.body.textContent).toContain("Hide empty fields")
  })
})
