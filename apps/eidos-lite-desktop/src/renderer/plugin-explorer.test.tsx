// @vitest-environment jsdom
import { act, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import type {
  PluginApi,
  PluginListing,
  PluginOpenResult,
} from "../shared/plugins"
import {
  ExplorerPicker,
  PluginExplorerPanel,
  usePluginExplorer,
} from "./plugin-explorer"

vi.mock("./i18n", () => ({
  useEidosLiteI18n: () => ({ t: (value: string) => value }),
}))
vi.mock("./plugin-editor", () => ({
  PluginEditor: ({
    onError,
    onOpenFile,
  }: {
    onError(message: string): void
    onOpenFile(path: string): void
  }) => {
    useEffect(() => {
      mounted()
      return () => unmounted()
    }, [])
    return (
      <div data-plugin>
        <button onClick={() => onError("failed")}>Fail plugin</button>
        <button onClick={() => onOpenFile("docs/note.md")}>Open note</button>
      </div>
    )
  },
}))
const { mounted, unmounted } = vi.hoisted(() => ({
  mounted: vi.fn(),
  unmounted: vi.fn(),
}))

const listing: PluginListing = {
  plugins: [
    {
      hash: "a",
      enabled: true,
      manifest: {
        apiVersion: 1,
        id: "example.tree",
        name: "Tree",
        version: "1.0.0",
        views: [
          {
            id: "tree",
            title: "Custom tree",
            kind: "page",
            entry: "./main.ts",
          },
        ],
        placements: [{ location: "sidebar/explorer", view: "tree" }],
      },
    },
  ],
  space: { plugins: {}, associations: {}, explorer: "example.tree/tree" },
}
const instance: NonNullable<PluginOpenResult["instance"]> = {
  ticket: "ticket",
  url: "eidos-plugin://test/index.html",
  editor: {
    key: "example.tree/tree",
    label: "Custom tree",
    pluginName: "Tree",
  },
}
const state = {
  rootDirectory: "docs",
  activePath: null,
  sort: { by: "name" as const, direction: "ascending" as const },
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.useRealTimers()
  document.body.replaceChildren()
})

it("opens sidebar files in the host and falls back without losing the built-in choice", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let current = structuredClone(listing)
  const open = vi.fn(async () => ({ instance }))
  const close = vi.fn(async () => {})
  const select = vi.fn(async (key: string | null) => {
    current = {
      ...current,
      space: { ...current.space!, explorer: key ?? undefined },
    }
  })
  const api: Partial<PluginApi> = {
    listPlugins: async () => current,
    openPluginExplorer: open,
    closePluginEditor: close,
    setPluginExplorer: select,
    onPluginEvent: () => () => {},
  }
  Object.defineProperty(window, "eidosLite", { configurable: true, value: api })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onOpenFile = vi.fn()
  function Harness() {
    const explorer = usePluginExplorer("space-a", state)
    return (
      <>
        <ExplorerPicker
          choices={explorer.choices}
          selected={explorer.selected}
          onSelect={(key) => void explorer.select(key)}
        />
        <PluginExplorerPanel
          explorer={explorer}
          state={state}
          onOpenFile={onOpenFile}
        >
          <header data-builtin-heading>Space heading</header>
          <div data-builtin>Built-in</div>
        </PluginExplorerPanel>
      </>
    )
  }
  try {
    await act(async () => {
      root.render(<Harness />)
    })
    expect(open).toHaveBeenCalledWith("example.tree/tree", state)
    expect(host.querySelector("[data-plugin]")).not.toBeNull()
    expect(host.querySelector("[data-builtin-heading]")).toBeNull()
    expect(host.querySelector("[data-builtin]")).toBeNull()
    const button = (text: string) =>
      [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === text
      )!
    await act(async () => {
      button("Open note").click()
    })
    expect(onOpenFile).toHaveBeenCalledWith("docs/note.md")
    await act(async () => {
      button("Fail plugin").click()
    })
    expect(host.querySelector("[data-builtin]")).not.toBeNull()
    expect(host.querySelector("[data-builtin-heading]")).not.toBeNull()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Choose file explorer"]'
        )!
        .click()
    })
    await act(async () => {
      button("Built-in explorer").click()
    })
    expect(select).toHaveBeenCalledWith(null)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
  }
  expect(close).toHaveBeenCalledWith("ticket")
})

it("replaces the whole explorer while mounting and restores it through the error action", async () => {
  vi.useFakeTimers()
  let finish!: (value: PluginOpenResult) => void
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      listPlugins: async () => listing,
      onPluginEvent: () => () => {},
      openPluginExplorer: () =>
        new Promise<PluginOpenResult>((resolve) => {
          finish = resolve
        }),
      closePluginEditor: vi.fn(async () => {}),
      setPluginExplorer: vi.fn(async () => {}),
    },
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  function Harness() {
    const explorer = usePluginExplorer("space-a", state)
    return (
      <PluginExplorerPanel
        explorer={explorer}
        state={state}
        onOpenFile={() => {}}
      >
        <header data-builtin-heading>Heading, search, sort, create</header>
        <div data-builtin>Tree</div>
      </PluginExplorerPanel>
    )
  }
  try {
    await act(async () => root.render(<Harness />))
    expect(host.querySelector("[data-builtin-heading]")).toBeNull()
    expect(host.querySelector('[role="status"]')).toBeNull()
    await act(async () => vi.advanceTimersByTime(200))
    expect(host.querySelector('[role="status"]')).not.toBeNull()
    await act(async () => finish({ instance: null, warning: "Mount failed" }))
    expect(host.querySelector("[data-builtin-heading]")).not.toBeNull()
    expect(host.querySelector("[data-builtin]")).not.toBeNull()
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Built-in explorer")!
        .click()
    )
    expect(window.eidosLite.setPluginExplorer).toHaveBeenCalledWith(null)
  } finally {
    await act(async () => root.unmount())
  }
})

it("keeps the plugin mounted behind a temporary host search overlay", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const explorer: ReturnType<typeof usePluginExplorer> = {
    choices: [],
    selected: "example.tree/tree",
    loading: false,
    instance,
    error: null,
    select: vi.fn(async () => {}),
    fail: vi.fn(),
    retry: vi.fn(),
  }
  const render = (search: boolean) =>
    root.render(
      <PluginExplorerPanel
        explorer={explorer}
        state={state}
        onOpenFile={() => {}}
        overlay={search ? <div data-search>Host search</div> : null}
      >
        <header data-builtin-heading>Built-in heading</header>
      </PluginExplorerPanel>
    )
  try {
    await act(async () => render(false))
    const plugin = host.querySelector("[data-plugin]")
    await act(async () => render(true))
    expect(host.querySelector("[data-search]")).not.toBeNull()
    expect(
      host.querySelector<HTMLDivElement>(".plugin-explorer-content")!.hidden
    ).toBe(true)
    expect(host.querySelector("[data-plugin]")).toBe(plugin)
    await act(async () => render(false))
    expect(host.querySelector("[data-search]")).toBeNull()
    expect(host.querySelector("[data-plugin]")).toBe(plugin)
    expect(mounted).toHaveBeenCalledTimes(1)
    expect(unmounted).not.toHaveBeenCalled()
    expect(host.querySelector("[data-builtin-heading]")).toBeNull()
  } finally {
    await act(async () => root.unmount())
  }
})

it("closes a late mount after changing Space instead of rendering it", async () => {
  let finish: (value: PluginOpenResult) => void = () => {}
  const closed = vi.fn(async () => {})
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      listPlugins: async () => listing,
      onPluginEvent: () => () => {},
      closePluginEditor: closed,
      openPluginExplorer: () =>
        new Promise<PluginOpenResult>((resolve) => {
          finish = resolve
        }),
    },
  })
  const root = createRoot(document.createElement("div"))
  function Harness({ spaceId }: { spaceId?: string }) {
    usePluginExplorer(spaceId, state)
    return null
  }
  try {
    await act(async () => {
      root.render(<Harness spaceId="space-a" />)
    })
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      finish({ instance })
    })
    expect(closed).toHaveBeenCalledWith("ticket")
  } finally {
    await act(async () => root.unmount())
  }
})
