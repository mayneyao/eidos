import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useQuickOpenStore } from "@/apps/web-app/store/quick-open-store"

import { FileSpaceSearch } from "./file-space-search"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const searchMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
const navigateAfterFlushMock = vi.hoisted(() => vi.fn())
const setGlobalSearchOpenMock = vi.hoisted(() => vi.fn())

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({
    currentSpace: { id: "space-a", mode: "file", name: "Notes" },
  }),
}))

vi.mock("@/apps/web-app/hooks/use-space-files", () => ({
  useSpaceFiles: () => ({ search: searchMock }),
  useSpaceFileChanges: () => undefined,
}))

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({
    location: {
      pathname: "/space-file",
      search: "",
      hash: "#notes%2Fcurrent.md",
    },
    navigate: navigateMock,
  }),
}))

vi.mock("@/apps/web-app/components/file-space/file-navigation", () => ({
  navigateAfterFlushingSpaceFile: navigateAfterFlushMock,
}))

vi.mock("@/apps/web-app/store/runtime-store", () => ({
  useAppRuntimeStore: (
    selector?: (state: {
      isGlobalSearchOpen: boolean
      setGlobalSearchOpen: (open: boolean) => void
    }) => unknown
  ) => {
    const state = {
      isGlobalSearchOpen: true,
      setGlobalSearchOpen: setGlobalSearchOpenMock,
    }
    return selector ? selector(state) : state
  },
}))

vi.mock("@/apps/web-app/store/tabs", () => ({
  useTabStore: (
    selector: (state: {
      activePanelId: string
      panels: Array<{ id: string; activeTabId: string }>
    }) => unknown
  ) =>
    selector({
      activePanelId: "panel-a",
      panels: [{ id: "panel-a", activeTabId: "tab-a" }],
    }),
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
}))

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CommandEmpty: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  CommandGroup: ({
    children,
    heading,
  }: React.PropsWithChildren<{ heading?: React.ReactNode }>) => (
    <div>
      {heading ? <div>{heading}</div> : null}
      {children}
    </div>
  ),
  CommandInput: ({
    placeholder,
    value,
    onValueChange,
  }: {
    placeholder?: string
    value: string
    onValueChange: (value: string) => void
  }) => (
    <input
      aria-label="Space search"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
  CommandItem: ({
    children,
    onSelect,
  }: React.PropsWithChildren<{ onSelect: () => void }>) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  CommandList: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))

async function settle(milliseconds = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
  })
}

describe("FileSpaceSearch", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    searchMock.mockReset()
    searchMock.mockResolvedValue([
      {
        path: "notes/project.md",
        name: "project.md",
        size: 24,
        mtimeMs: 100,
        match: "name",
        score: 1000,
      },
    ])
    navigateAfterFlushMock.mockReset()
    navigateAfterFlushMock.mockResolvedValue(true)
    navigateMock.mockReset()
    setGlobalSearchOpenMock.mockReset()
    useQuickOpenStore.setState({ sectionsByTab: {} })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("searches the file Space and flushes the current note before opening", async () => {
    act(() => root.render(<FileSpaceSearch />))
    await settle(10)

    expect(searchMock).toHaveBeenCalledWith("", { limit: 80 })
    const result = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("project.md")
    )
    expect(result).toBeDefined()

    act(() => result?.click())
    await settle()

    expect(navigateAfterFlushMock).toHaveBeenCalledWith({
      spaceId: "space-a",
      currentFilePath: "notes/current.md",
      destination: "/space-file#notes%2Fproject.md",
      navigate: navigateMock,
      options: { target: "_blank" },
    })
    expect(setGlobalSearchOpenMock).toHaveBeenCalledWith(false)
  })

  it("keeps search open when the current note cannot be saved", async () => {
    navigateAfterFlushMock.mockResolvedValue(false)
    act(() => root.render(<FileSpaceSearch />))
    await settle(10)

    const result = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("project.md")
    )
    act(() => result?.click())
    await settle()

    expect(container.textContent).toContain(
      "Eidos could not save the current file before opening this result."
    )
    expect(setGlobalSearchOpenMock).not.toHaveBeenCalledWith(false)
  })

  it("adds active Base tables as a contextual group without changing file search", async () => {
    const switchTable = vi.fn()
    useQuickOpenStore.getState().registerSection("tab-a", {
      id: "base-tables",
      heading: "Tables in tasks.base",
      inputHint: "tasks.base",
      priority: 100,
      items: [
        {
          id: "people",
          kind: "base-table",
          label: "People",
          detail: "4 rows",
          onSelect: switchTable,
        },
      ],
    })

    act(() => root.render(<FileSpaceSearch />))
    await settle(10)

    expect(container.textContent).toContain("Tables in tasks.base")
    expect(container.textContent).toContain("People")
    expect(container.textContent).toContain("project.md")
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Space search"]')
        ?.placeholder
    ).toBe("Search files or switch tables in tasks.base…")

    const tableResult = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("People")
    )
    act(() => tableResult?.click())
    await settle()

    expect(switchTable).toHaveBeenCalledOnce()
    expect(navigateAfterFlushMock).not.toHaveBeenCalled()
    expect(setGlobalSearchOpenMock).toHaveBeenCalledWith(false)
  })
})
