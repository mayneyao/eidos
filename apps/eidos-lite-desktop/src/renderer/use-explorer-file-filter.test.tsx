// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { useExplorerFileFilter } from "./use-explorer-file-filter"
import type {
  ExplorerFileFilter,
  ExplorerFilterGroup,
} from "./explorer-file-filter"
import type { SpaceTreeEntry } from "../shared/contracts"

const originalApi = Object.getOwnPropertyDescriptor(window, "eidosLite")
afterEach(() => {
  if (originalApi) Object.defineProperty(window, "eidosLite", originalApi)
  else Reflect.deleteProperty(window, "eidosLite")
})

it("retains ready content while property queries run and never carries it into another Space", async () => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const pending: Array<(entries: SpaceTreeEntry[]) => void> = []
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      filterSpaceFiles: vi.fn(
        () => new Promise<SpaceTreeEntry[]>((resolve) => pending.push(resolve))
      ),
    },
  })
  const file = (name: string): SpaceTreeEntry => ({
    name,
    relativePath: name,
    kind: "file",
    size: 1,
    modifiedAtMs: 1,
  })
  const entries = [file("ready.md"), file("other.md")]
  const filter = (value: string): ExplorerFilterGroup => ({
    type: "group",
    id: "root",
    conjunction: "and",
    children: [
      {
        type: "rule",
        id: "property",
        field: "property",
        operator: "matches",
        value: { type: "rule", field: "status", operator: "equals", value },
      },
    ],
  })
  let current!: ReturnType<typeof useExplorerFileFilter>
  function Harness({ space, value }: { space: string; value: string }) {
    current = useExplorerFileFilter(space, null, filter(value), entries)
    return null
  }
  const root = createRoot(document.createElement("div"))
  try {
    await act(async () => root.render(<Harness space="first" value="Todo" />))
    expect(current.entries).toEqual(entries)
    await act(async () => vi.advanceTimersByTime(120))
    await act(async () => pending[0]!([entries[0]!]))
    await act(async () => root.render(<Harness space="first" value="Done" />))
    expect(current.entries).toEqual([entries[0]])
    expect(current.loading).toBe(true)
    await act(async () => root.render(<Harness space="second" value="Done" />))
    expect(current.entries).toEqual(entries)
  } finally {
    await act(async () => root.unmount())
    vi.useRealTimers()
  }
})

it("coalesces condition typing and ignores older full-tree results", async () => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const pending: Array<(entries: SpaceTreeEntry[]) => void> = []
  const filter = vi.fn(
    () => new Promise<SpaceTreeEntry[]>((resolve) => pending.push(resolve))
  )
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { filterSpaceFiles: filter },
  })
  const file = (name: string): SpaceTreeEntry => ({
    name,
    relativePath: name,
    kind: "file",
    size: 1,
    modifiedAtMs: 1,
  })
  const entries = [file("report.md"), file("notes.md")]
  const group = (value: string): ExplorerFilterGroup => ({
    type: "group",
    id: "root",
    conjunction: "and",
    children: [
      { type: "rule", id: "rule", field: "name", operator: "contains", value },
    ],
  })
  let current!: ReturnType<typeof useExplorerFileFilter>
  function Harness({ value }: { value: ExplorerFilterGroup }) {
    current = useExplorerFileFilter("space", null, value, entries)
    return null
  }
  const root = createRoot(document.createElement("div"))
  try {
    await act(async () => root.render(<Harness value={group("re")} />))
    expect(current.entries.map((entry) => entry.name)).toEqual(["report.md"])
    await act(async () => root.render(<Harness value={group("report")} />))
    expect(filter).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(120))
    expect(filter).toHaveBeenCalledOnce()
    await act(async () => root.render(<Harness value={group("notes")} />))
    await act(async () => pending[0]!([file("stale-report.md")]))
    expect(current.entries.map((entry) => entry.name)).toEqual(["notes.md"])
    await act(async () => vi.advanceTimersByTime(120))
    await act(async () => pending[1]!([file("nested/notes.md")]))
    expect(current.entries[0]!.name).toBe("nested/notes.md")
    const equivalent = group("NOTES")
    equivalent.children = [
      ...equivalent.children,
      {
        type: "rule",
        id: "blank",
        field: "name",
        operator: "contains",
        value: "",
      },
    ]
    await act(async () => root.render(<Harness value={equivalent} />))
    await act(async () => vi.advanceTimersByTime(120))
    expect(filter).toHaveBeenCalledTimes(2)
    expect(current.entries[0]!.name).toBe("nested/notes.md")
    expect(current.loading).toBe(false)
    await act(async () => root.render(<Harness value={group("")} />))
    expect(current.entries).toBe(entries)
    expect(current.loading).toBe(false)
  } finally {
    await act(async () => root.unmount())
    vi.useRealTimers()
  }
})

it("rejects stale type results, restores all files immediately, and retries failures", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const pending: {
    resolve(entries: SpaceTreeEntry[]): void
    reject(error: Error): void
  }[] = []
  const filter = vi.fn(
    () =>
      new Promise<SpaceTreeEntry[]>((resolve, reject) =>
        pending.push({ resolve, reject })
      )
  )
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { filterSpaceFiles: filter },
  })
  const file = (name: string): SpaceTreeEntry => ({
    name,
    relativePath: name,
    kind: "file",
    size: 1,
    modifiedAtMs: 1,
  })
  const entries = [file("note.md"), file("photo.png")]
  let current!: ReturnType<typeof useExplorerFileFilter>
  function Harness({
    value,
    changes,
  }: {
    value: ExplorerFileFilter
    changes?: string[]
  }) {
    current = useExplorerFileFilter("space", null, value, entries, changes)
    return null
  }
  const root = createRoot(document.createElement("div"))
  try {
    await act(async () => root.render(<Harness value={[".md"]} />))
    await act(async () => root.render(<Harness value={[".png"]} />))
    await act(async () => pending[0]!.resolve([file("old.md")]))
    expect(current.entries.map((entry) => entry.name)).toEqual(["photo.png"])
    await act(async () => pending[1]!.resolve([file("deep/photo.png")]))
    expect(current.entries[0]!.name).toBe("deep/photo.png")
    await act(async () => root.render(<Harness value={[]} />))
    expect(current.entries).toBe(entries)
    await act(async () => root.render(<Harness value={[".eidos"]} />))
    await act(async () => pending[2]!.reject(new Error("Unavailable")))
    expect(current.error).toBe("Unavailable")
    await act(async () => current.retry())
    await act(async () => pending[3]!.resolve([file("data.eidos")]))
    expect(current.error).toBeUndefined()
    expect(current.loading).toBe(false)
    expect(current.entries[0]!.name).toBe("data.eidos")
    await act(async () =>
      root.render(
        <Harness value={[".eidos"]} changes={["unloaded/new.eidos"]} />
      )
    )
    await act(async () => pending[4]!.resolve([file("unloaded/new.eidos")]))
    expect(current.entries[0]!.name).toBe("unloaded/new.eidos")
  } finally {
    await act(async () => root.unmount())
  }
})
