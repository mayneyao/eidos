// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import {
  EidosFileUIProvider,
  type EidosFilePlugin,
} from "@eidos.space/eidos-file-ui"
import { usePluginTableViews } from "./plugin-view"

it("changes plugin labels without replacing the mounted table renderer", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        plugins: [
          {
            enabled: true,
            manifest: {
              apiVersion: 1,
              id: "test.localized",
              name: "%name%",
              version: "1.0.0",
              i18n: {
                defaultLocale: "en",
                messages: { en: "./en.json", "zh-CN": "./zh.json" },
              },
              views: [
                {
                  id: "table",
                  title: "%name%",
                  kind: "file",
                  capabilities: ["eidos/table"],
                  entry: "./table.js",
                },
              ],
              placements: [{ location: "table/view", view: "table" }],
            },
            localization: {
              defaultLocale: "en",
              messages: { en: { name: "History" }, "zh-CN": { name: "历史" } },
            },
          },
        ],
      }),
    }))
  )
  let current: EidosFilePlugin[] = []
  function Probe() {
    current = usePluginTableViews(false)
    return null
  }
  const root = createRoot(document.createElement("div"))
  try {
    await act(async () =>
      root.render(
        <EidosFileUIProvider locale="en">
          <Probe />
        </EidosFileUIProvider>
      )
    )
    expect(current[0].views![0].label).toBe("History")
    const renderer = current[0].views![0].renderer
    await act(async () =>
      root.render(
        <EidosFileUIProvider locale="zh">
          <Probe />
        </EidosFileUIProvider>
      )
    )
    expect(current[0].views![0].label).toBe("历史")
    expect(current[0].views![0].renderer).toBe(renderer)
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})
