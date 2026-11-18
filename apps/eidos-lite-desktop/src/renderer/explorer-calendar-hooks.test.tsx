// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { useExplorerFileFilter } from "./use-explorer-file-filter"
import { useExplorerRecentFiles } from "./use-explorer-recent-files"
import type { ExplorerCalendarExecution } from "../shared/explorer-calendar"
import type {
  ExplorerFilesQuery,
  ExplorerFilesPage,
} from "../shared/explorer-file-list"
import type { ExplorerFilterGroup } from "../shared/explorer-file-filter"
import type { SpaceTreeEntry } from "../shared/contracts"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const execution: ExplorerCalendarExecution = {
  calendarQueryVersion: 2,
  calendar: {
    timeZone: "America/New_York",
    timeZoneData: "2026f",
    weekStartsOn: 1,
  },
}
const filterFor = (field: "property" | "file-system"): ExplorerFilterGroup => ({
  type: "group",
  id: "root",
  conjunction: "and",
  children: [
    {
      type: "rule",
      id: "date",
      field,
      operator: "matches",
      value: {
        type: "rule",
        field: field === "file-system" ? "explorer:createdAt" : "day",
        operator: "is-in-calendar-period",
        value: { unit: "day", offset: 0 },
      },
    },
  ],
})
const file = (name: string): SpaceTreeEntry => ({
  name,
  relativePath: name,
  kind: "file",
  size: 1,
  modifiedAtMs: 1,
})
const page = (name: string, root: string): ExplorerFilesPage => ({
  entries: [file(name)],
  earlierCount: 60,
  total: 61,
  hasMore: true,
  referenceInstant: root,
})

it.each(["property", "file-system"] as const)(
  "refreshes tree %s filters on zone/week/profile changes and ignores stale replies",
  checkTreeCalendarFilter
)

async function checkTreeCalendarFilter(field: "property" | "file-system") {
  vi.useFakeTimers()
  const pending: Array<{
    execution: ExplorerCalendarExecution
    resolve: (entries: SpaceTreeEntry[]) => void
  }> = []
  vi.stubGlobal("eidosLite", {
    filterSpaceFiles: (
      _filter: unknown,
      _directory: unknown,
      _ignore: unknown,
      execution: ExplorerCalendarExecution
    ) =>
      new Promise<SpaceTreeEntry[]>((resolve) =>
        pending.push({ execution, resolve })
      ),
  })
  let current!: ReturnType<typeof useExplorerFileFilter>
  const entries: SpaceTreeEntry[] = []
  const filter = filterFor(field)
  function Harness({
    value = execution,
  }: {
    value?: ExplorerCalendarExecution
  }) {
    current = useExplorerFileFilter(
      "space",
      null,
      filter,
      entries,
      undefined,
      false,
      false,
      value
    )
    return null
  }
  const root = createRoot(document.createElement("div"))
  try {
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => vi.advanceTimersByTimeAsync(150))
    const sh = {
      ...execution,
      calendar: { ...execution.calendar, timeZone: "Asia/Shanghai" },
    }
    await act(async () => root.render(<Harness value={sh} />))
    await act(async () => vi.advanceTimersByTimeAsync(150))
    expect(pending[1]!.execution.calendar.timeZone).toBe("Asia/Shanghai")
    await act(async () => pending[0]!.resolve([file("stale-ny.md")]))
    expect(current.entries).toEqual([])
    await act(async () => pending[1]!.resolve([file("sh.md")]))
    expect(current.entries[0]!.name).toBe("sh.md")
    await act(async () =>
      root.render(
        <Harness
          value={{ ...sh, calendar: { ...sh.calendar, weekStartsOn: 0 } }}
        />
      )
    )
    await act(async () => vi.advanceTimersByTimeAsync(150))
    expect(pending[2]!.execution.calendar.weekStartsOn).toBe(0)
    await act(async () =>
      root.render(
        <Harness
          value={{
            ...sh,
            calendar: { ...sh.calendar, timeZoneData: "future" },
          }}
        />
      )
    )
    await act(async () => vi.advanceTimersByTimeAsync(150))
    expect(pending[3]!.execution.calendar.timeZoneData).toBe("future")
    await act(async () => pending[2]!.resolve([file("stale-week.md")]))
    expect(current.entries[0]!.name).toBe("sh.md")
    await act(async () => pending[3]!.resolve([file("new-profile.md")]))
    expect(current.entries[0]!.name).toBe("new-profile.md")
  } finally {
    await act(async () => root.unmount())
  }
}

it.each(["property", "file-system"] as const)(
  "binds Gallery %s continuations to the returned root and starts fresh after calendar changes",
  checkGalleryCalendarFilter
)

async function checkGalleryCalendarFilter(field: "property" | "file-system") {
  const pending: Array<{
    query: ExplorerFilesQuery
    resolve: (page: ExplorerFilesPage) => void
  }> = []
  vi.stubGlobal("eidosLite", {
    listExplorerFiles: (query: ExplorerFilesQuery) =>
      new Promise<ExplorerFilesPage>((resolve) =>
        pending.push({ query, resolve })
      ),
  })
  let current!: ReturnType<typeof useExplorerRecentFiles>
  const filter = filterFor(field)
  function Harness({
    value = execution,
  }: {
    value?: ExplorerCalendarExecution
  }) {
    current = useExplorerRecentFiles({
      spaceId: "space",
      directory: null,
      filter,
      sort: { by: "name", direction: "ascending" },
      sinceMs: 0,
      visible: true,
      refreshKey: "static",
      calendarExecution: value,
    })
    return null
  }
  const root = createRoot(document.createElement("div"))
  try {
    await act(async () => root.render(<Harness />))
    const ny = "2026-11-12T23:59:59.999Z",
      sh = "2026-11-13T00:00:00.001Z"
    await act(async () => pending[0]!.resolve(page("ny.md", ny)))
    await act(async () => current.setExpanded(true))
    expect(pending[1]!.query.calendarExecution?.referenceInstant).toBe(ny)
    await act(async () =>
      root.render(
        <Harness
          value={{
            ...execution,
            calendar: { ...execution.calendar, timeZone: "Asia/Shanghai" },
          }}
        />
      )
    )
    expect(
      pending[2]!.query.calendarExecution?.referenceInstant
    ).toBeUndefined()
    await act(async () => pending[1]!.resolve(page("stale-earlier.md", ny)))
    expect(current.earlier).toEqual([])
    await act(async () => pending[2]!.resolve(page("sh.md", sh)))
    expect(pending[3]!.query.calendarExecution?.referenceInstant).toBe(sh)
    expect(pending[3]!.query.calendarExecution?.calendar.timeZone).toBe(
      "Asia/Shanghai"
    )
    await act(async () => pending[3]!.resolve(page("new-earlier.md", sh)))
    expect(current.earlier[0]!.name).toBe("new-earlier.md")
  } finally {
    await act(async () => root.unmount())
  }
}
