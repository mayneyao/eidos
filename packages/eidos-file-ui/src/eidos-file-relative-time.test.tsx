// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { EidosFileUIProvider } from "./context"
import { EidosFileRelativeTime } from "./eidos-file-relative-time"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
it("shows localized relative time, retains exact time on hover, and updates as time passes", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-19T12:00:00Z"))
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <EidosFileUIProvider locale="en">
          <EidosFileRelativeTime
            value="2026-09-19T11:58:00Z"
            title="2026-09-19 11:58:00"
          />
        </EidosFileUIProvider>
      )
    )
    expect(host.textContent).toBe("2 minutes ago")
    expect(host.querySelector("time")?.title).toBe("2026-09-19 11:58:00")
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(host.textContent).toBe("3 minutes ago")
    await act(async () =>
      root.render(
        <EidosFileUIProvider locale="zh">
          <EidosFileRelativeTime value="2026-09-19T11:58:00Z" title="exact" />
        </EidosFileUIProvider>
      )
    )
    expect(host.textContent).toBe("3分钟前")
  } finally {
    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  }
})
