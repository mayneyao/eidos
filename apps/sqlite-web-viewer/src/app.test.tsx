import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type * as GlideDataGrid from "@glideapps/glide-data-grid"
import { vi } from "vitest"

import type { SQLiteViewerClient } from "./runtime/client"
import type {
  DatabaseSnapshot,
  RelationDetails,
  RelationPage,
  RelationSummary,
} from "./types"

const gridMock = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}))

vi.mock("@glideapps/glide-data-grid", async (importOriginal) => {
  const original = await importOriginal<typeof GlideDataGrid>()
  return {
    ...original,
    default: (props: Record<string, unknown>) => {
      gridMock.props = props
      return React.createElement("div", { "data-testid": "mock-data-grid" })
    },
  }
})

import { App } from "./app"
import { CUSTOM_SQLITE_EXTENSIONS_STORAGE_KEY } from "./files/custom-extensions"

function relation(
  name: string,
  kind: "table" | "view" = "table"
): RelationSummary {
  return {
    kind,
    name,
    rootPage: kind === "table" ? 2 : 0,
    sql: null,
    withoutRowid: false,
  }
}

function snapshot(relations: RelationSummary[]): DatabaseSnapshot {
  return {
    fileName: "fixture.eidos",
    readOnly: true,
    relations,
    overview: {
      applicationId: 0,
      encoding: "UTF-8",
      fileBytes: 4_096,
      freePages: 0,
      pageCount: 1,
      pageSize: 4_096,
      schemaVersion: 1,
      tableCount: relations.filter((item) => item.kind === "table").length,
      userVersion: 0,
      viewCount: relations.filter((item) => item.kind === "view").length,
    },
  }
}

function details(item: RelationSummary): RelationDetails {
  return {
    columns: [
      {
        cid: 0,
        declaredType: "TEXT",
        defaultValue: null,
        hidden: 0,
        name: "title",
        notNull: false,
        primaryKeyOrder: 0,
      },
    ],
    foreignKeys: [],
    indexes: [],
    relation: item,
    rowCount: 1,
    rowidAlias: item.kind === "table" ? "rowid" : null,
    stableOrder: item.kind === "table" ? "rowid" : "visible columns",
  }
}

function validFile(name = "fixture.eidos"): File {
  const bytes = new Uint8Array(4_096)
  bytes.set(new TextEncoder().encode("SQLite format 3\0"))
  return new File([bytes], name, { type: "application/vnd.sqlite3" })
}

function mockClient(nextSnapshot: DatabaseSnapshot): SQLiteViewerClient {
  return {
    close: vi.fn(async () => undefined),
    getDetails: vi.fn(async (name) =>
      details(nextSnapshot.relations.find((item) => item.name === name)!)
    ),
    getPage: vi.fn(
      async () => ({ offset: 0, rows: [] }) satisfies RelationPage
    ),
    open: vi.fn(async () => nextSnapshot),
    terminate: vi.fn(),
  }
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await flush()
    }
  }
  throw lastError
}

describe("SQLite viewer app", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    gridMock.props = null
  })

  async function render(client: SQLiteViewerClient): Promise<void> {
    await act(async () => root.render(<App createClient={() => client} />))
  }

  async function choose(file: File): Promise<void> {
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", {
      configurable: true,
      value: {
        item: (index: number) => (index === 0 ? file : null),
        length: 1,
      },
    })
    await act(async () =>
      input.dispatchEvent(new Event("change", { bubbles: true }))
    )
    await flush()
    await flush()
  }

  it("opens a valid .eidos file and renders its first table read-only", async () => {
    const nextSnapshot = snapshot([
      relation("entries"),
      relation("summary", "view"),
    ])
    const client = mockClient(nextSnapshot)
    await render(client)
    await choose(validFile())

    expect(client.open).toHaveBeenCalledWith(
      "fixture.eidos",
      expect.any(ArrayBuffer)
    )
    expect(container.textContent).toContain("fixture.eidos")
    expect(container.textContent).toContain("Local only")
    expect(container.textContent).toContain("Read-only")
    await waitFor(() =>
      expect(
        container.querySelector("[data-testid='mock-data-grid']")
      ).not.toBeNull()
    )
  })

  it("keeps resized data columns controlled by Glide Data Grid", async () => {
    const client = mockClient(snapshot([relation("entries")]))
    await render(client)
    await choose(validFile())
    await waitFor(() => expect(gridMock.props).not.toBeNull())

    const initialColumns = gridMock.props?.columns as GlideDataGrid.GridColumn[]
    const resize = gridMock.props?.onColumnResize as NonNullable<
      GlideDataGrid.DataEditorProps["onColumnResize"]
    >
    const titleColumn = initialColumns.find((column) => column.id === "title")!

    await act(async () => resize(titleColumn, 248, 1, 248))

    const resizedColumns = gridMock.props?.columns as GlideDataGrid.GridColumn[]
    const resizedTitle = resizedColumns.find((column) => column.id === "title")!
    expect("width" in resizedTitle ? resizedTitle.width : undefined).toBe(248)
    expect(gridMock.props?.minColumnWidth).toBe(72)
    expect(gridMock.props?.maxColumnWidth).toBe(720)
  })

  it("persists a custom suffix and opens a matching SQLite file", async () => {
    const client = mockClient(snapshot([relation("entries")]))
    await render(client)

    const settingsButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Configure SQLite file suffixes"]'
    )!
    await act(async () =>
      settingsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    )
    const suffixInput = container.querySelector<HTMLInputElement>(
      "#custom-sqlite-extension"
    )!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(suffixInput, "anki2")
      suffixInput.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const addButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Add"
    )!
    await act(async () =>
      addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    )
    await flush()

    expect(
      JSON.parse(
        localStorage.getItem(CUSTOM_SQLITE_EXTENSIONS_STORAGE_KEY) ?? "[]"
      )
    ).toEqual([".anki2"])
    expect(
      container.querySelector<HTMLInputElement>('input[type="file"]')?.accept
    ).toContain(".anki2")

    await choose(validFile("collection.anki2"))
    expect(client.open).toHaveBeenCalledWith(
      "collection.anki2",
      expect.any(ArrayBuffer)
    )
  })

  it("switches between database objects", async () => {
    const nextSnapshot = snapshot([
      relation("entries"),
      relation("summary", "view"),
    ])
    const client = mockClient(nextSnapshot)
    await render(client)
    await choose(validFile())
    const summary = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("summary")
    )!
    await act(async () =>
      summary.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    )
    await flush()

    expect(client.getDetails).toHaveBeenLastCalledWith("summary")
    expect(container.querySelector(".relation-header")?.textContent).toContain(
      "summary"
    )
    expect(container.querySelector(".relation-header")?.textContent).toContain(
      "computed"
    )
  })

  it("explains invalid SQLite headers without calling the worker", async () => {
    const client = mockClient(snapshot([]))
    await render(client)
    await choose(new File([new Uint8Array(100)], "broken.eidos"))

    expect(client.open).not.toHaveBeenCalled()
    expect(container.textContent).toContain("file header is not SQLite")
    expect(container.textContent).toContain("Choose another file")
  })

  it("shows the database overview for a valid empty schema", async () => {
    const client = mockClient(snapshot([]))
    await render(client)
    await choose(validFile("empty.sqlite"))

    expect(container.textContent).toContain("No user tables or views")
    expect(container.textContent).toContain("valid SQLite database")
    expect(container.textContent).toContain("Page layout")
  })

  it("reports a damaged database returned by the worker", async () => {
    const client = mockClient(snapshot([]))
    client.open = vi.fn(async () => {
      throw new Error("database disk image is malformed")
    })
    await render(client)
    await choose(validFile("damaged.db"))

    expect(container.textContent).toContain("database is damaged")
    expect(container.querySelector("[role='alert']")).not.toBeNull()
  })
})
