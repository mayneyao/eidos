import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useKVStore } from "@/apps/web-app/store/kv-store"

import { useSqliteKV } from "./use-sqlite-kv"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const sqliteMocks = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
}))

vi.mock("./use-sqlite", () => {
  const sqlite = { kv: sqliteMocks }
  return {
    useSqlite: () => ({ sqlite }),
  }
})

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []

  constructor(readonly name: string) {
    MockBroadcastChannel.instances.push(this)
  }

  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  close = vi.fn()
}

function Probe({ enabled }: { enabled: boolean }) {
  const [value, setValue] = useSqliteKV(
    "runtime-policy-test",
    "default",
    enabled
  )
  return <button onClick={() => setValue("changed")}>{value}</button>
}

describe("useSqliteKV runtime isolation", () => {
  let root: Root
  let container: HTMLDivElement
  let originalBroadcastChannel: typeof globalThis.BroadcastChannel

  beforeEach(() => {
    originalBroadcastChannel = globalThis.BroadcastChannel
    Object.assign(globalThis, { BroadcastChannel: MockBroadcastChannel })
    MockBroadcastChannel.instances = []
    sqliteMocks.get.mockClear()
    sqliteMocks.put.mockClear()
    useKVStore.setState({ cache: {} })
    container = document.createElement("div")
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    Object.assign(globalThis, { BroadcastChannel: originalBroadcastChannel })
  })

  it("does not read SQLite or subscribe to database events when disabled", async () => {
    useKVStore.setState({ cache: { "runtime-policy-test": "legacy-value" } })
    await act(async () => {
      root.render(<Probe enabled={false} />)
    })

    expect(container.textContent).toBe("default")
    expect(sqliteMocks.get).not.toHaveBeenCalled()
    expect(sqliteMocks.put).not.toHaveBeenCalled()
    expect(MockBroadcastChannel.instances).toHaveLength(0)

    await act(async () => {
      container.querySelector("button")?.click()
    })
    expect(useKVStore.getState().cache["runtime-policy-test"]).toBe(
      "legacy-value"
    )
  })

  it("keeps the legacy behavior when enabled", async () => {
    await act(async () => {
      root.render(<Probe enabled />)
    })

    expect(sqliteMocks.get).toHaveBeenCalledOnce()
    expect(MockBroadcastChannel.instances).toHaveLength(1)
  })
})
