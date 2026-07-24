import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"

import { useSpaceEidosFile } from "./use-space-eidos-file"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const hostMocks = vi.hoisted(() => ({
  close: vi.fn(),
  openSource: vi.fn(),
  registerSource: vi.fn(),
  revokeSource: vi.fn(),
}))
const sourceMocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  initialize: vi.fn(),
}))
const importEidosFileCsvMock = vi.hoisted(() => vi.fn())

vi.mock("@/apps/web-app/lib/eidos-file/desktop-host-services", () => ({
  desktopEidosFileHost: hostMocks,
}))

vi.mock("@eidos.space/eidos-file-ui", () => ({
  EidosRuntimeEditorDataSource: class {
    initialize = sourceMocks.initialize
    getSnapshot = sourceMocks.getSnapshot
  },
}))

const snapshot = {
  path: "projects/tasks.eidos",
  metadata: {
    format: "eidos-file",
    fileId: "file-1",
    formatVersion: "1.0",
    schemaVersion: 1,
    title: "Tasks",
    revision: 1,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  },
  tables: [],
} satisfies EidosFileSnapshot

describe("useSpaceEidosFile", () => {
  let container: HTMLDivElement
  let root: Root
  let result: ReturnType<typeof useSpaceEidosFile> | undefined

  beforeEach(() => {
    hostMocks.close.mockReset()
    hostMocks.openSource.mockReset()
    hostMocks.registerSource.mockReset()
    hostMocks.revokeSource.mockReset()
    sourceMocks.getSnapshot.mockReset()
    sourceMocks.initialize.mockReset()
    importEidosFileCsvMock.mockReset()

    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        spaceMgmt: {
          importEidosFileCsv: importEidosFileCsvMock,
        },
      },
    })

    hostMocks.registerSource.mockResolvedValue({ sourceToken: "source-1" })
    hostMocks.openSource.mockResolvedValue({
      sessionId: "session-1",
      runtime: {},
      state: {},
    })
    hostMocks.close.mockResolvedValue(undefined)
    hostMocks.revokeSource.mockResolvedValue(undefined)
    sourceMocks.initialize.mockResolvedValue(snapshot)
    sourceMocks.getSnapshot.mockResolvedValue(snapshot)

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function Probe() {
    result = useSpaceEidosFile("space-a")
    return null
  }

  it("shares one live runtime session across concurrent snapshot reads", async () => {
    await act(async () => root.render(<Probe />))

    await act(async () => {
      await Promise.all([
        result?.getSnapshot("projects/tasks.eidos"),
        result?.getSnapshot("projects/tasks.eidos"),
      ])
    })

    expect(hostMocks.registerSource).toHaveBeenCalledTimes(1)
    expect(hostMocks.openSource).toHaveBeenCalledTimes(1)
    expect(sourceMocks.initialize).toHaveBeenCalledTimes(1)
    expect(sourceMocks.getSnapshot).toHaveBeenCalledTimes(2)
    expect(hostMocks.close).not.toHaveBeenCalled()
  })

  it("only replaces the runtime session for an explicit reload", async () => {
    hostMocks.registerSource
      .mockResolvedValueOnce({ sourceToken: "source-1" })
      .mockResolvedValueOnce({ sourceToken: "source-2" })
    hostMocks.openSource
      .mockResolvedValueOnce({
        sessionId: "session-1",
        runtime: {},
        state: {},
      })
      .mockResolvedValueOnce({
        sessionId: "session-2",
        runtime: {},
        state: {},
      })
    await act(async () => root.render(<Probe />))

    await act(async () => {
      await result?.getSnapshot("projects/tasks.eidos")
      await result?.reloadSnapshot("projects/tasks.eidos")
    })

    expect(hostMocks.registerSource).toHaveBeenCalledTimes(2)
    expect(hostMocks.openSource).toHaveBeenCalledTimes(2)
    expect(hostMocks.close).toHaveBeenCalledTimes(1)
    expect(hostMocks.close).toHaveBeenCalledWith(
      { sessionId: "session-1" },
      expect.objectContaining({ requestId: expect.stringContaining("close") })
    )
  })

  it("does not open a replacement writer until the previous session is closed", async () => {
    let finishClose: (() => void) | undefined
    hostMocks.close.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishClose = resolve
        })
    )
    hostMocks.registerSource
      .mockResolvedValueOnce({ sourceToken: "source-1" })
      .mockResolvedValueOnce({ sourceToken: "source-2" })
    hostMocks.openSource
      .mockResolvedValueOnce({
        sessionId: "session-1",
        runtime: {},
        state: {},
      })
      .mockResolvedValueOnce({
        sessionId: "session-2",
        runtime: {},
        state: {},
      })
    await act(async () => root.render(<Probe />))
    await result?.getSnapshot("projects/tasks.eidos")

    const reload = result?.reloadSnapshot("projects/tasks.eidos")
    await vi.waitFor(() => expect(hostMocks.close).toHaveBeenCalledOnce())
    const concurrentRead = result?.getSnapshot("projects/tasks.eidos")
    await Promise.resolve()

    expect(hostMocks.registerSource).toHaveBeenCalledTimes(1)
    expect(hostMocks.openSource).toHaveBeenCalledTimes(1)

    finishClose?.()
    await Promise.all([reload, concurrentRead])

    expect(hostMocks.registerSource).toHaveBeenCalledTimes(2)
    expect(hostMocks.openSource).toHaveBeenCalledTimes(2)
    expect(sourceMocks.getSnapshot).toHaveBeenCalledTimes(3)
  })

  it("returns the Runtime-normalized snapshot after a Desktop CSV import", async () => {
    const importedResult = {
      table: { id: "imported-table" },
      importedRowCount: 2_500,
      skippedRowCount: 0,
    }
    const ipcSnapshot = {
      ...snapshot,
      metadata: { ...snapshot.metadata, revision: 2 },
    }
    const runtimeSnapshot = {
      ...ipcSnapshot,
      metadata: { ...ipcSnapshot.metadata, title: "Runtime normalized" },
    }
    importEidosFileCsvMock.mockResolvedValue({
      result: importedResult,
      snapshot: ipcSnapshot,
    })
    sourceMocks.initialize.mockResolvedValue(runtimeSnapshot)
    sourceMocks.getSnapshot.mockResolvedValue(runtimeSnapshot)
    await act(async () => root.render(<Probe />))

    const imported = await result?.importCsv(
      "projects/tasks.eidos",
      "csv-token",
      {},
      "csv-operation"
    )

    expect(importEidosFileCsvMock).toHaveBeenCalledWith(
      "space-a",
      "projects/tasks.eidos",
      "csv-token",
      {},
      "csv-operation"
    )
    expect(hostMocks.openSource).toHaveBeenCalledTimes(1)
    expect(sourceMocks.getSnapshot).toHaveBeenCalledTimes(1)
    expect(imported).toEqual({
      result: importedResult,
      snapshot: runtimeSnapshot,
    })
  })
})
