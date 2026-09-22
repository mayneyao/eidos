// @vitest-environment jsdom
import { StrictMode, act, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import type { ComponentProps } from "react"
import type { PluginRequest } from "@eidos.space/plugin-runtime/rpc"
import { PluginTableActions } from "./plugin-table-actions"
import { EidosFileTableActionMenu } from "@eidos.space/eidos-file-ui"

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
          const rows = (await request("table.target.read", {
            offset: 0,
            limit: 1,
            fields: ["field"],
          })) as Array<{ readToken: string }>
          const output = {
            readToken: rows[0]!.readToken,
            values: { field: "sales" },
          }
          expect(await request("table.task.preview", { rows: [output] })).toBe(
            true
          )
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
afterEach(async () => {
  await act(async () => cleanup())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it("keeps dynamic menu results when StrictMode repeats the loading effect", async () => {
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
      captureTableActionTarget: async () => ["row"],
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
          target={{ ranges: null }}
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
    (container.querySelector('[role="menuitem"]') as HTMLButtonElement).click()
  )
  expect(props.source.writeTableActionRow).toHaveBeenCalledOnce()
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
})
