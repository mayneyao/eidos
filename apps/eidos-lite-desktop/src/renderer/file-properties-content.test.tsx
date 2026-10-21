// @vitest-environment jsdom
import { act, createRef, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"
import type { EidosLiteApi } from "../shared/contracts"
import type { FilePropertiesFields } from "./file-properties-fields"

const surface = vi.hoisted(() => ({
  current: null as ComponentProps<typeof FilePropertiesFields> | null,
}))
vi.mock("@eidos.space/eidos-file-ui", () => ({
  EidosFileUIProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}))
vi.mock("./file-properties-fields", () => ({
  FilePropertiesFields: (
    props: ComponentProps<typeof FilePropertiesFields>
  ) => {
    surface.current = props
    return (
      <div data-file-row={String(props.row._id)}>
        <input aria-label="test property" disabled={props.disabled} />
      </div>
    )
  },
}))
import { FilePropertiesContent } from "./file-properties-content"
import type { FilePropertiesContentHandle } from "./file-properties-content"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const snapshot = {
  tables: [
    {
      table: { id: "files", settings: { vtabModule: "fs_meta" } },
      fields: [
        {
          id: "path",
          name: "path",
          tableColumnName: "path",
          settings: { isSystem: true },
        },
        {
          id: "rating",
          name: "rating",
          tableColumnName: "rating",
          type: "rating",
          valueKind: "source",
        },
      ],
      views: [],
    },
  ],
} as unknown as EidosFileSnapshot
let element: HTMLDivElement
let root: ReturnType<typeof createRoot>
let props: ComponentProps<typeof FilePropertiesContent>
let call: ReturnType<typeof vi.fn>
let rows: Record<string, Record<string, string | number>>
beforeEach(() => {
  element = document.createElement("div")
  document.body.append(element)
  root = createRoot(element)
  rows = {
    "a.md": { _id: "a.md", path: "a.md", rating: 1 },
    "b.md": { _id: "b.md", path: "b.md", rating: 2 },
  }
  call = vi.fn(async (_session, method, args) => {
    if (method === "getSnapshot") return snapshot
    if (method === "readTablePluginConfig")
      return { value: null, version: "null" }
    if (method === "getPage") {
      const path = args[3].filter.children[0].value
      return { rows: rows[path] ? [rows[path]] : [], total: rows[path] ? 1 : 0 }
    }
    if (method === "updateRow") {
      rows[args[1]] = { ...rows[args[1]], ...args[2] }
      return { row: rows[args[1]], rowCount: 2, tableId: "files" }
    }
    if (method === "writeTablePluginConfig")
      return { value: args[2].value, version: "next" }
    throw new Error(method)
  })
  window.eidosLite = {
    openFileMetadata: vi.fn(async () => ({ sessionId: "catalog", snapshot })),
    callRuntime: call,
  } as unknown as EidosLiteApi
  props = {
    relativePath: "a.md",
    disabled: false,
    theme: "light",
    refreshToken: 0,
    onReleaseEidosFile: vi.fn(async () => {}),
    onChanged: vi.fn(),
    onClose: vi.fn(),
  }
})
afterEach(async () => {
  await act(async () => root.unmount())
  element.remove()
  surface.current = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function render() {
  await act(async () => {
    root.render(<FilePropertiesContent {...props} />)
  })
}

it("flushes a focused draft and waits for its save before closing", async () => {
  const content = createRef<FilePropertiesContentHandle>()
  await act(async () => {
    root.render(<FilePropertiesContent ref={content} {...props} />)
  })
  const field = snapshot.tables[0]!.fields[1]!
  const unregister = surface.current!.registerCommit?.("rating", () => {
    void surface.current!.onEdit(field, 5)
    return true
  })
  let allowed = false
  await act(async () => {
    allowed = await content.current!.flushDrafts()
  })
  expect(allowed).toBe(true)
  expect(rows["a.md"]!.rating).toBe(5)
  unregister?.()
})

it("refuses to close while a draft cannot be committed", async () => {
  const content = createRef<FilePropertiesContentHandle>()
  await act(async () => {
    root.render(<FilePropertiesContent ref={content} {...props} />)
  })
  surface.current!.registerCommit?.("rating", () => false)
  let allowed = true
  await act(async () => {
    allowed = await content.current!.flushDrafts()
  })
  expect(allowed).toBe(false)
})

it("coalesces form layout measurements before reporting a native window height", async () => {
  let resized!: ResizeObserverCallback
  let frame = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback
      }
      observe() {}
      disconnect() {}
    }
  )
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frame, callback)
    return frame
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id))
  const height = vi.fn()
  props = { ...props, onContentHeight: height }
  await render()
  const content = element.querySelector<HTMLElement>(
    ".file-properties-content"
  )!
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
    height: 420,
  } as DOMRect)
  resized([], {} as ResizeObserver)
  resized([], {} as ResizeObserver)
  expect(height).not.toHaveBeenCalled()
  expect(frames.size).toBe(1)
  for (const callback of frames.values()) callback(0)
  frames.clear()
  expect(height).toHaveBeenCalledExactlyOnceWith(420)
  resized([], {} as ResizeObserver)
  for (const callback of frames.values()) callback(0)
  expect(height).toHaveBeenCalledOnce()
})

it("confirms a copied path only after the clipboard succeeds, then resets the feedback", async () => {
  let finish!: () => void
  const writeText = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  vi.stubGlobal(
    "navigator",
    Object.create(navigator, { clipboard: { value: { writeText } } })
  )
  props = { ...props, spacePath: "/demo" }
  await render()
  vi.useFakeTimers()
  const button = element.querySelector<HTMLButtonElement>(
    'button[aria-label="Copy path"]'
  )!
  await act(async () => button.click())
  expect(writeText).toHaveBeenCalledWith("/demo")
  expect(button.textContent).not.toContain("Copied")
  await act(async () => finish())
  expect(button.textContent).toBe("Copied")
  expect(button.querySelector("svg.lucide-check")).not.toBeNull()
  await act(async () => vi.advanceTimersByTime(1800))
  expect(button.textContent).toBe("")
  expect(button.querySelector("svg.lucide-copy")).not.toBeNull()
})

it("shows a retryable copy failure without inserting a form-level error", async () => {
  const writeText = vi
    .fn()
    .mockRejectedValueOnce(new Error("Denied"))
    .mockResolvedValueOnce(undefined)
  vi.stubGlobal(
    "navigator",
    Object.create(navigator, { clipboard: { value: { writeText } } })
  )
  await render()
  const button = element.querySelector<HTMLButtonElement>(
    'button[aria-label="Copy path"]'
  )!
  await act(async () => button.click())
  expect(button.textContent).toBe("Could not copy. Try again.")
  expect(element.querySelector(".file-sidebar-error")).toBeNull()
  await act(async () => button.click())
  expect(button.textContent).toBe("Copied")
})

it("edits the physical file record and follows file changes without carrying values across files", async () => {
  await render()
  expect(surface.current?.row._id).toBe("a.md")
  await act(async () => {
    await surface.current!.onEdit(snapshot.tables[0]!.fields[1]!, 4)
  })
  expect(rows["a.md"]!.rating).toBe(4)
  props = { ...props, relativePath: "b.md" }
  await render()
  expect(surface.current?.row.rating).toBe(2)
  expect(props.onReleaseEidosFile).not.toHaveBeenCalled()
})

it.each(["select", "multi-select"])(
  "creates %s options through Runtime without duplicate names on retry",
  async (type) => {
    const catalog = structuredClone(snapshot)
    const tags = {
      ...catalog.tables[0]!.fields[1]!,
      id: "tags",
      name: "tags",
      tableColumnName: "tags",
      type,
      property: {
        options: [{ name: "已有", color: "purple" }],
        defaultOption: "已有",
      },
    } as (typeof snapshot.tables)[number]["fields"][number]
    catalog.tables[0]!.fields.push(tags)
    rows["a.md"]!.tags = type === "select" ? "已有" : '["已有"]'
    vi.mocked(window.eidosLite.openFileMetadata).mockResolvedValue({
      sessionId: "catalog",
      snapshot: catalog,
      relativePath: ".eidos/files.eidos",
      readOnly: false,
    })
    const original = call.getMockImplementation() as (
      session: unknown,
      method: unknown,
      args: unknown
    ) => Promise<unknown>
    call.mockImplementation(async (session, method, args) => {
      if (method === "getSnapshot") return catalog
      if (method === "updateField") {
        expect(args.slice(0, 2)).toEqual(["files", "tags"])
        tags.property = args[2].property
        return catalog
      }
      return original(session, method, args)
    })
    await render()
    await act(async () => {
      await surface.current!.onCreateOption(tags, "新增")
    })
    expect(tags.property).toEqual({
      options: [
        { name: "已有", color: "purple" },
        { name: "新增", color: "green" },
      ],
      defaultOption: "已有",
    })
    expect(rows["a.md"]!.tags).toBe(
      type === "select" ? "新增" : '["已有","新增"]'
    )
    await act(async () => {
      await surface.current!.onCreateOption(tags, "新增")
    })
    expect(
      call.mock.calls.filter(([, method]) => method === "updateField")
    ).toHaveLength(1)
    expect(rows["a.md"]!.tags).toBe(
      type === "select" ? "新增" : '["已有","新增"]'
    )
  }
)

it("keeps the next field focused and editable while saving a property", async () => {
  await render()
  let finish!: (value: unknown) => void
  call.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const input = element.querySelector<HTMLInputElement>(
    'input[aria-label="test property"]'
  )!
  input.focus()
  let saving!: Promise<void>
  await act(async () => {
    saving = surface.current!.onEdit(snapshot.tables[0]!.fields[1]!, 4)
  })
  expect(surface.current?.disabled).toBe(false)
  expect(document.activeElement).toBe(input)
  expect(
    (element.querySelector(".file-properties-body") as HTMLElement).inert
  ).toBe(false)
  await act(async () => {
    finish({ row: { _id: "a.md", rating: 4 }, rowCount: 2, tableId: "files" })
    await saving
  })
  expect(document.activeElement).toBe(input)
})

it("refreshes the same file without a loading row, a new source, or a lost draft", async () => {
  await render()
  const source = surface.current!.source
  const input = element.querySelector<HTMLInputElement>("input")!
  input.value = "unfinished draft"
  input.focus()
  let finish!: (value: unknown) => void
  const original = call.getMockImplementation() as (
    session: unknown,
    method: unknown,
    args: unknown
  ) => Promise<unknown>
  call.mockImplementation((session, method, args) =>
    method === "getPage"
      ? new Promise((resolve) => {
          finish = resolve
        })
      : original(session, method, args)
  )
  props = { ...props, refreshToken: 1 }
  await render()
  expect(element.textContent).not.toContain("Loading properties")
  expect(
    element.querySelector(".file-properties-content")?.getAttribute("aria-busy")
  ).toBe("false")
  expect(surface.current!.disabled).toBe(false)
  await act(async () => {
    finish({ rows: [{ ...rows["a.md"], rating: 3 }], total: 1 })
  })
  expect(surface.current!.row.rating).toBe(3)
  expect(surface.current!.source).toBe(source)
  expect(window.eidosLite.openFileMetadata).toHaveBeenCalledTimes(1)
  expect(element.querySelector("input")).toBe(input)
  expect(input.value).toBe("unfinished draft")
  expect(document.activeElement).toBe(input)
})

it("does not restore an old value when a refresh completes after a newer edit", async () => {
  await render()
  let finish!: (value: unknown) => void
  const original = call.getMockImplementation() as (
    session: unknown,
    method: unknown,
    args: unknown
  ) => Promise<unknown>
  call.mockImplementation((session, method, args) =>
    method === "getPage"
      ? new Promise((resolve) => {
          finish = resolve
        })
      : original(session, method, args)
  )
  props = { ...props, refreshToken: 1 }
  await render()
  await act(async () => {
    await surface.current!.onEdit(snapshot.tables[0]!.fields[1]!, 5)
  })
  expect(surface.current!.row.rating).toBe(5)
  await act(async () =>
    finish({ rows: [{ ...rows["a.md"], rating: 1 }], total: 1 })
  )
  expect(surface.current!.row.rating).toBe(5)
})

it("offers retry for a failed edit without pretending it saved", async () => {
  await render()
  call.mockImplementationOnce(async () => {
    throw new Error("Disk is read-only")
  })
  await act(async () => {
    await surface.current!.onEdit(snapshot.tables[0]!.fields[1]!, 4)
  })
  expect(element.textContent).toContain("Disk is read-only")
  expect(rows["a.md"]!.rating).toBe(1)
  const retry = Array.from(element.querySelectorAll("button")).find(
    (button) => button.textContent === "Retry"
  )!
  await act(async () => retry.click())
  expect(rows["a.md"]!.rating).toBe(4)
  expect(element.textContent).not.toContain("Disk is read-only")
})

it("keeps a failed edit retryable after switching files and retries its original file", async () => {
  await render()
  call.mockImplementationOnce(async () => {
    throw new Error("Disk is read-only")
  })
  await act(async () => {
    await surface.current!.onEdit(snapshot.tables[0]!.fields[1]!, 4)
  })
  props = { ...props, relativePath: "b.md" }
  await render()
  expect(element.textContent).toContain("a.md: Disk is read-only")
  const retry = Array.from(element.querySelectorAll("button")).find(
    (button) => button.textContent === "Retry"
  )!
  await act(async () => retry.click())
  expect(rows["a.md"]!.rating).toBe(4)
  expect(surface.current?.row._id).toBe("b.md")
  expect(surface.current?.row.rating).toBe(2)
})

it("does not use a case-insensitive match for a different file", async () => {
  rows["a.md"] = { _id: "A.md", path: "A.md", rating: 1 }
  await render()
  expect(surface.current).toBeNull()
  expect(element.textContent).toContain("This file is no longer available")
})

it("rejects a late load after a newer file has been selected", async () => {
  let resolve!: (value: unknown) => void
  const slow = new Promise((done) => {
    resolve = done
  })
  const original = call.getMockImplementation() as (
    session: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>
  call.mockImplementation((session, method, args) =>
    method === "getPage" && args[3].filter.children[0].value === "a.md"
      ? slow
      : original(session, method, args)
  )
  await render()
  props = { ...props, relativePath: "b.md" }
  await render()
  expect(surface.current?.row._id).toBe("b.md")
  await act(async () => resolve({ rows: [rows["a.md"]], total: 1 }))
  expect(surface.current?.row._id).toBe("b.md")
})
