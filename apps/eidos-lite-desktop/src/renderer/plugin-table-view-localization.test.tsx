// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it } from "vitest"
import { usePluginTableViews } from "./plugin-table-view"
import type { PluginListing } from "../shared/plugins"
import type { EidosFilePlugin } from "@eidos.space/eidos-file-ui"

it("updates table labels without replacing its renderer until the package changes", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let current: EidosFilePlugin[] = []
  let refresh: (() => void) | undefined
  let name = "History"
  let hash = "same-package"
  Object.assign(window, {
    eidosLite: {
      listPlugins: async (): Promise<PluginListing> => ({
        space: null,
        plugins: [
          {
            hash,
            enabled: true,
            manifest: {
              apiVersion: 1,
              id: "test.localized",
              name,
              version: "1.0.0",
              views: [
                {
                  id: "table",
                  title: name,
                  kind: "file",
                  capabilities: ["eidos/table"],
                  entry: "./table.js",
                },
              ],
              placements: [{ location: "table/view", view: "table" }],
            },
          },
        ],
      }),
      onPluginEvent: (
        listener: (value: { event: { observation: string } }) => void
      ) => {
        refresh = () => listener({ event: { observation: "host.catalog" } })
        return () => {}
      },
    },
  })
  function Probe() {
    current = usePluginTableViews()
    return null
  }
  const element = document.createElement("div")
  const root = createRoot(element)
  try {
    await act(async () => root.render(<Probe />))
    const renderer = current[0].views![0].renderer
    name = "历史"
    await act(async () => refresh!())
    expect(current[0].views![0].label).toBe("历史")
    expect(current[0].views![0].renderer).toBe(renderer)
    hash = "new-package"
    await act(async () => refresh!())
    expect(current[0].views![0].renderer).not.toBe(renderer)
  } finally {
    await act(async () => root.unmount())
  }
})
