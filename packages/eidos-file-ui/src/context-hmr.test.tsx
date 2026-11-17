// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it } from "vitest"
import type * as UIContextModule from "./context"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

it("keeps calendar capabilities between provider and consumer module generations", async () => {
  const providerModule = "./context.tsx?generation=provider"
  const consumerModule = "./context.tsx?generation=consumer"
  const { EidosFileUIProvider } = (await import(
    providerModule
  )) as typeof UIContextModule
  const { useEidosFileUI } = (await import(
    consumerModule
  )) as typeof UIContextModule
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  function Consumer() {
    const host = useEidosFileUI()
    return (
      <output>
        {JSON.stringify({
          calendarWindowVersion: host.calendarWindowVersion,
          calendarPeriodTimeZoneData: host.calendarPeriodTimeZoneData,
        })}
      </output>
    )
  }
  try {
    await act(async () => {
      root.render(
        <EidosFileUIProvider
          calendarWindowVersion={1}
          calendarPeriodTimeZoneData={["2026f"]}
        >
          <Consumer />
        </EidosFileUIProvider>
      )
    })
    expect(JSON.parse(container.textContent!)).toEqual({
      calendarWindowVersion: 1,
      calendarPeriodTimeZoneData: ["2026f"],
    })
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
