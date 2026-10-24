// @vitest-environment jsdom
import { StrictMode, act, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import type { ComponentProps } from "react"
import type { PluginRequest } from "@eidos.space/plugin-runtime/rpc"
import type {
  EidosFileDataSource,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import { PluginTableActions } from "./plugin-table-actions"
import {
  EidosFileTableActionMenu,
  EidosFileTableActionsContext,
  type EidosFileTableActions,
} from "@eidos.space/eidos-file-ui"

const calls = vi.hoisted(() => ({ lists: 0 }))
vi.mock("./plugin-editor", () => ({
  PluginEditor: (props: {
    instance: { ticket: string }
    onTableRequest(request: PluginRequest): Promise<unknown>
    hostEvent?: { observation: string; value: unknown }
  }) => {
    useEffect(() => {
      void props.onTableRequest({
        protocol: "eidos-plugin",
        apiVersion: 1,
        id: "ready",
        method: "table.actions.ready",
        params: { providers: ["smart"] },
      })
    }, [props.instance.ticket])
    useEffect(() => {
      if (props.hostEvent?.observation !== "host.tableAction") return
      const job = props.hostEvent.value as { id: string; operation: string }
      if (job.operation === "run") {
        const request = (method: PluginRequest["method"], args: unknown) =>
          props.onTableRequest({
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: crypto.randomUUID(),
            method,
            params: { runId: job.id, args },
          })
        void (async () => {
          const rows = (await request("table.target.readRows", {
            offset: 0,
            limit: 1,
            fields: ["field"],
          })) as Array<{ readToken: string }>
          const output = {
            readToken: rows[0]!.readToken,
            values: { field: "Long article paragraph.\n".repeat(12000) },
          }
          expect(
            await request("table.task.declareOutputs", { rows: [output] })
          ).toBe(null)
          await request("table.target.update", output)
          await request("table.task.report", {
            completed: 1,
            message: "Estimated cost $0.000042 USD",
          })
          await request("table.actions.result", {})
        })()
        return
      }
      if (job.operation !== "list") return
      calls.lists++
      queueMicrotask(() => {
        void props.onTableRequest({
          protocol: "eidos-plugin",
          apiVersion: 1,
          id: "result",
          method: "table.actions.result",
          params: {
            runId: job.id,
            items: [
              {
                id: "classify",
                title: "Classify requests",
                icon: { paths: ["M3 3h18v18H3Z"] },
                targets: ["row", "view"],
              },
            ],
          },
        })
      })
    }, [props.hostEvent])
    return null
  },
}))

let cleanup = () => {}
it("opens mapped files through the existing internal and system host flows", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const openPath = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      listPlugins: async () => ({ plugins: [] }),
      onPluginEvent: () => () => {},
      openPath,
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanup = () => root.unmount()
  const onOpenSpaceFile = vi.fn()
  const getRow = vi
    .fn()
    .mockResolvedValue({ _id: "notes.md", path: "notes.md" })
  const props = {
    source: { getRow },
    table: {
      table: {
        id: "files",
        settings: { vtabModule: "fs_meta", vtabConfig: { root: "." } },
      },
      fields: [
        { name: "path", tableColumnName: "path", settings: { isSystem: true } },
      ],
    },
    query: {},
    disabled: false,
    onSnapshot: vi.fn(),
    fileRelativePath: "assets/files.eidos",
    onOpenSpaceFile,
    onError: vi.fn(),
  } as unknown as Omit<ComponentProps<typeof PluginTableActions>, "children">
  await act(async () =>
    root.render(
      <PluginTableActions {...props}>
        <EidosFileTableActionMenu
          target={{
            rowId: "notes.md",
            ranges: [{ startIndex: 0, endIndex: 1 }],
          }}
          onClose={() => {}}
        />
      </PluginTableActions>
    )
  )
  const items =
    container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
  expect([...items].map((item) => item.textContent)).toEqual([
    "Open in Eidos",
    "Open with default app",
    "File properties",
  ])
  await act(async () => items[0]!.click())
  expect(onOpenSpaceFile).toHaveBeenCalledWith("assets/notes.md")
  expect(openPath).not.toHaveBeenCalled()
  await act(async () => items[1]!.click())
  expect(openPath).toHaveBeenCalledWith("assets/notes.md")
  expect(props.onError).not.toHaveBeenCalled()
})
afterEach(async () => {
  await act(async () => cleanup())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it.each([undefined, "row"])(
  "keeps dynamic menu results and executes the intended target %s",
  async (rowId) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    calls.lists = 0
    let ticket = 0
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listPlugins: async () => ({
          plugins: [
            {
              enabled: true,
              manifest: {
                id: "eidos.smart-actions",
                name: "Smart Actions",
                version: "0.1.0",
                actions: [{ id: "smart", context: "table", access: "write" }],
                placements: [{ location: "table/context", action: "smart" }],
              },
            },
          ],
        }),
        onPluginEvent: () => () => {},
        openPluginExtension: async () => ({
          instance: {
            ticket: String(++ticket),
            url: "about:blank",
            editor: { key: "smart", label: "Smart", pluginName: "Smart" },
          },
        }),
        closePluginEditor: vi.fn().mockResolvedValue(undefined),
      },
    })
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    cleanup = () => root.unmount()
    const props = {
      source: {
        captureTableActionTarget: vi.fn(async () => ["row"]),
        getRow: vi.fn(async () => ({ _id: "row" })),
        readTableActionRows: async () => [
          { id: "row", values: { field: "" }, version: "v1" },
        ],
        writeTableActionRow: vi.fn().mockResolvedValue({ undoToken: "undo" }),
        undoTableActionRow: vi.fn().mockResolvedValue({ undoToken: "inverse" }),
        getSnapshot: async () => ({}),
        releaseTableActionUndo: vi.fn(),
      },
      table: { table: { id: "table" }, fields: [] },
      view: { id: "grid" },
      query: {},
      disabled: false,
      onSnapshot: vi.fn(),
      children: (
        <div>
          Grid
          <EidosFileTableActionMenu
            target={{ ranges: null, rowId }}
            onClose={() => {}}
          />
        </div>
      ),
    } as unknown as ComponentProps<typeof PluginTableActions>
    await act(async () =>
      root.render(
        <StrictMode>
          <PluginTableActions {...props} />
        </StrictMode>
      )
    )
    expect(container.textContent).not.toContain("Actions · filtered records")
    expect(container.textContent).not.toContain("Connection settings")
    expect(container.textContent).toContain("Classify requests")
    expect(
      container.querySelector('[role="menuitem"] svg path')?.getAttribute("d")
    ).toBe("M3 3h18v18H3Z")
    expect(calls.lists).toBe(1)
    await act(async () =>
      (
        container.querySelector('[role="menuitem"]') as HTMLButtonElement
      ).click()
    )
    expect(props.source.writeTableActionRow).toHaveBeenCalledOnce()
    if (rowId) {
      expect(props.source.getRow).toHaveBeenCalledWith("table", "row")
      expect(props.source.captureTableActionTarget).not.toHaveBeenCalled()
    } else {
      expect(props.source.captureTableActionTarget).toHaveBeenCalledOnce()
    }
    expect(container.textContent).toContain("Done · 1 updated · 0 unchanged")
    expect(container.textContent).toContain("Estimated cost $0.000042 USD")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    expect(container.textContent).toContain("Done · 1 updated · 0 unchanged")
    expect(container.textContent).not.toContain("Apply and continue")
    const clickText = async (label: string) =>
      act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((b) => b.textContent === label)!
          .click()
      })
    await clickText("Undo this run")
    expect(container.textContent).toContain("Run undone")
    expect(container.textContent).toContain("Estimated cost $0.000042 USD")
    await clickText("Redo this run")
    expect(container.textContent).toContain("Run redone")
    expect(props.source.undoTableActionRow).toHaveBeenCalledTimes(2)
    expect(props.source.writeTableActionRow).toHaveBeenCalledOnce()
  }
)

it("opens the current fs_meta file in the sidebar and properties without main or system navigation", async () => {
  let currentActions: EidosFileTableActions | null = null
  const getRow = vi.fn(async () => ({ "path-id": "images/a.png" }))
  const onMain = vi.fn()
  const onSidebar = vi.fn()
  const onError = vi.fn()
  const openPath = vi.fn()
  const openFileProperties = vi.fn(async () => undefined)
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      listPlugins: async () => ({ plugins: [] }),
      onPluginEvent: () => () => {},
      openPath,
      openFileProperties,
    },
  })
  const table = {
    table: {
      id: "files",
      settings: { vtabModule: "fs_meta", vtabConfig: { root: "." } },
    },
    fields: [
      {
        name: "path",
        tableColumnName: "path-id",
        settings: { isSystem: true },
      },
    ],
  } as unknown as EidosFileTableSnapshot
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const render = async (disabled = false, value = table) =>
    act(async () =>
      root.render(
        <PluginTableActions
          fileRelativePath="files.eidos"
          source={{ getRow } as unknown as EidosFileDataSource}
          table={value}
          query={{}}
          disabled={disabled}
          onSnapshot={() => {}}
          onOpenSpaceFile={onMain}
          onOpenFileInSidebar={onSidebar}
          onError={onError}
        >
          <EidosFileTableActionsContext.Consumer>
            {(value) => {
              currentActions = value
              return null
            }}
          </EidosFileTableActionsContext.Consumer>
          <EidosFileTableActionMenu
            target={{ rowId: "row", ranges: null }}
            onClose={() => {}}
          />
        </PluginTableActions>
      )
    )
  try {
    await render()
    const sameFile = await currentActions!.list({
      rowId: "row",
      ranges: null,
      fileUri: "images/a.png",
    })
    expect(
      sameFile.find((item) => item.id === "host/open-mapped-file-system")
        ?.replaces
    ).toBe("core/open-file")
    const differentFile = await currentActions!.list({
      rowId: "row",
      ranges: null,
      fileUri: "images/other.png",
    })
    expect(
      differentFile.find((item) => item.id === "host/open-mapped-file-system")
        ?.replaces
    ).toBeUndefined()
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    )
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Open in Eidos",
      "Open in sidebar",
      "Open with default app",
      "File properties",
    ])
    // Resolve again when invoked, because the row can have changed since listing.
    getRow.mockResolvedValue({ "path-id": "images/b.png" })
    await act(async () => buttons[1]!.click())
    expect(onSidebar).toHaveBeenCalledExactlyOnceWith("images/b.png")
    expect(onMain).not.toHaveBeenCalled()
    expect(openPath).not.toHaveBeenCalled()
    getRow.mockResolvedValue({ "path-id": "images/c.png" })
    await act(async () => buttons[3]!.click())
    expect(openFileProperties).toHaveBeenCalledExactlyOnceWith("images/c.png")
    getRow.mockResolvedValue({ "path-id": "../escape.png" })
    await act(async () => buttons[3]!.click())
    expect(onError).toHaveBeenCalledOnce()
    expect(openFileProperties).toHaveBeenCalledTimes(1)
    expect(onSidebar).toHaveBeenCalledTimes(1)
    await render(true)
    expect(container.querySelectorAll('[role="menuitem"]')).toHaveLength(0)
    await render(false, { ...table, table: { ...table.table, settings: {} } })
    expect(container.querySelectorAll('[role="menuitem"]')).toHaveLength(0)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
