// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { useExplorerRecentFiles } from "./use-explorer-recent-files"
import type {
  ExplorerFilesPage,
  ExplorerFilesQuery,
} from "../shared/explorer-file-list"
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => vi.unstubAllGlobals())
const page: ExplorerFilesPage = {
  entries: [
    {
      name: "ready.md",
      relativePath: "ready.md",
      kind: "file",
      size: 1,
      modifiedAtMs: 1,
    },
  ],
  earlierCount: 60,
  total: 1,
  hasMore: false,
}
it("threads ignore options through both periods and discards replies from an older option", async () => {
  const pending: Array<{
    query: ExplorerFilesQuery
    resolve(page: ExplorerFilesPage): void
  }> = []
  vi.stubGlobal("eidosLite", {
    listExplorerFiles: (query: ExplorerFilesQuery) =>
      new Promise<ExplorerFilesPage>((resolve) =>
        pending.push({ query, resolve })
      ),
  })
  let current!: ReturnType<typeof useExplorerRecentFiles>
  function Harness({ respectGitignore }: { respectGitignore: boolean }) {
    current = useExplorerRecentFiles({
      spaceId: "one",
      directory: null,
      filter: [],
      sort: { by: "name", direction: "ascending" },
      sinceMs: 0,
      visible: true,
      refreshKey: "stable",
      respectGitignore,
    })
    return null
  }
  const root = createRoot(document.createElement("div"))
  try {
    await act(async () => root.render(<Harness respectGitignore={false} />))
    expect(pending[0]!.query.respectGitignore).toBe(false)
    await act(async () => pending[0]!.resolve(page))
    await act(async () => current.setExpanded(true))
    expect(pending[1]!.query).toMatchObject({
      respectGitignore: false,
      period: "earlier",
    })
    await act(async () => root.render(<Harness respectGitignore />))
    expect(pending[2]!.query).toMatchObject({
      respectGitignore: true,
      period: "recent",
    })
    await act(async () =>
      pending[1]!.resolve({
        ...page,
        entries: [{ ...page.entries[0]!, name: "old-option.md" }],
      })
    )
    await act(async () =>
      pending[2]!.resolve({
        ...page,
        entries: [{ ...page.entries[0]!, name: "filtered.md" }],
      })
    )
    expect(current.entries[0]!.name).toBe("filtered.md")
    expect(pending[3]!.query).toMatchObject({
      respectGitignore: true,
      period: "earlier",
      offset: 0,
    })
    await act(async () => pending[3]!.resolve({ ...page, entries: [] }))
    expect(current.earlier).toEqual([])
  } finally {
    await act(async () => root.unmount())
  }
})
it("keeps ready data on view switches, fetches Earlier only on expansion, and rejects stale Space results", async () => {
  const pending: Array<{
    query: ExplorerFilesQuery
    resolve(page: ExplorerFilesPage): void
  }> = []
  const list = vi.fn(
    (query: ExplorerFilesQuery) =>
      new Promise<ExplorerFilesPage>((resolve) =>
        pending.push({ query, resolve })
      )
  )
  vi.stubGlobal("eidosLite", { listExplorerFiles: list })
  let current!: ReturnType<typeof useExplorerRecentFiles>
  function Harness({ visible = true, space = "first" }) {
    current = useExplorerRecentFiles({
      spaceId: space,
      directory: null,
      filter: [],
      sort: { by: "name", direction: "ascending" },
      sinceMs: 0,
      visible,
      refreshKey: "stable",
    })
    return null
  }
  const root = createRoot(document.createElement("div"))
  try {
    await act(async () => root.render(<Harness />))
    expect(current.loading).toBe(true)
    await act(async () => pending[0]!.resolve(page))
    expect(current.entries).toBe(page.entries)
    expect(current.expanded).toBe(false)
    await act(async () => root.render(<Harness visible={false} />))
    expect(current.entries).toBe(page.entries)
    await act(async () => root.render(<Harness />))
    expect(list).toHaveBeenCalledTimes(1)
    await act(async () => current.setExpanded(true))
    expect(pending[1]!.query).toMatchObject({ period: "earlier", offset: 0 })
    await act(async () => root.render(<Harness space="second" />))
    expect(current.entries).toEqual([])
    expect(current.expanded).toBe(false)
    await act(async () =>
      pending[1]!.resolve({
        ...page,
        entries: [{ ...page.entries[0]!, name: "stale.md" }],
      })
    )
    expect(current.earlier).toEqual([])
    await act(async () => pending[2]!.resolve({ ...page, entries: [] }))
    expect(current.entries).toEqual([])
  } finally {
    await act(async () => root.unmount())
  }
})
