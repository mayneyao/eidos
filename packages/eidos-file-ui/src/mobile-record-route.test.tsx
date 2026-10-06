// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import {
  MobileRecordPage,
  mobileRecordUrl,
  parseMobileRecordUrl,
  useMobileRecordRoute,
} from "./mobile-record-route"

it("encodes file-scoped record URLs and rejects malformed or foreign file routes", () => {
  const route = { file: "资料/a.eidos", tableId: "table/1", rowId: "record #2" }
  expect(parseMobileRecordUrl(mobileRecordUrl(route), route.file)).toEqual(
    route
  )
  expect(parseMobileRecordUrl(mobileRecordUrl(route), "other.eidos")).toBeNull()
  expect(parseMobileRecordUrl("#/records/%xx/t/r", route.file)).toBeNull()
})

it("routes outside the file chrome, retains the table and restores it on Back and Forward", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  history.replaceState(null, "", "/")
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const notify = vi.fn().mockResolvedValue(undefined)
  let route: ReturnType<typeof useMobileRecordRoute>
  function App() {
    route = useMobileRecordRoute("notes.eidos", notify, (error) => {
      throw error
    })
    return (
      <main aria-hidden={Boolean(route.route)}>
        <input defaultValue="table filter" />
        {route.route && (
          <MobileRecordPage>
            <h1>{route.route.rowId}</h1>
          </MobileRecordPage>
        )}
      </main>
    )
  }
  try {
    await act(async () => root.render(<App />))
    const input = container.querySelector("input")!
    input.value = "retained search"
    await act(async () => route.open("table", "one"))
    expect(location.hash).toBe(
      mobileRecordUrl({ file: "notes.eidos", tableId: "table", rowId: "one" })
    )
    expect(
      document.querySelector("[data-mobile-record-page]")?.parentElement
    ).toBe(document.body)
    expect(container.querySelector("h1")).toBeNull()
    expect(notify).toHaveBeenLastCalledWith(true)
    await act(async () => route.open("table", "two"))
    await act(async () => {
      route.close()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(document.querySelector("[data-mobile-record-page]")).toBeNull()
    expect(container.querySelector("input")).toBe(input)
    expect(input.value).toBe("retained search")
    expect(notify).toHaveBeenLastCalledWith(false)
    await act(async () => {
      history.forward()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(
      document.querySelector("[data-mobile-record-page]")?.textContent
    ).toBe("two")
  } finally {
    await act(async () => root.unmount())
    container.remove()
    history.replaceState(null, "", "/")
    vi.unstubAllGlobals()
  }
})
