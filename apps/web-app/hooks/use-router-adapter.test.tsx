import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useSpaceStore, type SpaceInfo } from "./use-current-space"
import { useRouterAdapter } from "./use-router-adapter"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const sqliteKvMock = vi.hoisted(() =>
  vi.fn((_key: string, defaultValue: unknown, _enabled?: boolean) => [
    defaultValue,
    vi.fn(),
  ])
)

vi.mock("./use-sqlite-kv", () => ({
  useSqliteKV: sqliteKvMock,
}))

function Probe() {
  useRouterAdapter()
  return null
}

function space(mode: SpaceInfo["mode"]): SpaceInfo {
  return {
    id: "test-space",
    name: "Test Space",
    path: "/tmp/test-space",
    mode,
  }
}

describe("useRouterAdapter runtime isolation", () => {
  let root: Root

  beforeEach(() => {
    sqliteKvMock.mockClear()
    useSpaceStore.setState({ spaceInfo: null })
    root = createRoot(document.createElement("div"))
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  it("keeps tab navigation settings outside the database runtime for file Spaces", async () => {
    useSpaceStore.setState({ spaceInfo: space("file") })

    await act(async () => {
      root.render(<Probe />)
    })

    expect(sqliteKvMock).toHaveBeenCalledTimes(2)
    expect(sqliteKvMock.mock.calls.every((call) => call[2] === false)).toBe(
      true
    )
  })

  it("loads tab navigation settings for legacy Spaces", async () => {
    useSpaceStore.setState({ spaceInfo: space("legacy") })

    await act(async () => {
      root.render(<Probe />)
    })

    expect(sqliteKvMock).toHaveBeenCalledTimes(2)
    expect(sqliteKvMock.mock.calls.every((call) => call[2] === true)).toBe(true)
  })
})
