import {
  registerPwaSQLiteFileHandler,
  type PwaLaunchParams,
  type PwaLaunchQueue,
  type PwaLaunchTarget,
} from "./pwa-file-handler"

function sqliteFileHandle(name = "archive.eidos"): FileSystemFileHandle {
  const bytes = new Uint8Array(100)
  bytes.set(new TextEncoder().encode("SQLite format 3\0"))
  return {
    kind: "file",
    name,
    getFile: vi.fn(
      async () => new File([bytes], name, { type: "application/vnd.sqlite3" })
    ),
  } as unknown as FileSystemFileHandle
}

describe("PWA SQLite file handler", () => {
  it("delivers an associated SQLite file to the viewer", async () => {
    let consumer:
      | ((params: PwaLaunchParams) => void | Promise<void>)
      | undefined
    const queue: PwaLaunchQueue = {
      setConsumer: (next) => {
        consumer = next
      },
    }
    const onOpen = vi.fn()
    const onError = vi.fn()

    registerPwaSQLiteFileHandler({
      onOpen,
      onError,
      target: { launchQueue: queue },
    })
    await consumer?.({ files: [sqliteFileHandle()] })

    await vi.waitFor(() =>
      expect(onOpen).toHaveBeenCalledWith(
        expect.objectContaining({ name: "archive.eidos" })
      )
    )
    expect(onError).not.toHaveBeenCalled()
  })

  it("keeps the launch queue connected to the current React subscriber", async () => {
    let consumer:
      | ((params: PwaLaunchParams) => void | Promise<void>)
      | undefined
    const setConsumer = vi.fn(
      (next: (params: PwaLaunchParams) => void | Promise<void>) => {
        consumer = next
      }
    )
    const target: PwaLaunchTarget = { launchQueue: { setConsumer } }
    const staleOpen = vi.fn()
    const cleanup = registerPwaSQLiteFileHandler({
      onOpen: staleOpen,
      onError: vi.fn(),
      target,
    })

    await consumer?.({ files: [sqliteFileHandle("records.db3")] })
    cleanup()
    const currentOpen = vi.fn()
    registerPwaSQLiteFileHandler({
      onOpen: currentOpen,
      onError: vi.fn(),
      target,
    })

    await vi.waitFor(() => expect(currentOpen).toHaveBeenCalledOnce())
    expect(staleOpen).not.toHaveBeenCalled()
    expect(setConsumer).toHaveBeenCalledOnce()
  })

  it("reports file handle failures without opening a database", async () => {
    let consumer:
      | ((params: PwaLaunchParams) => void | Promise<void>)
      | undefined
    const error = new DOMException("File access was denied", "NotAllowedError")
    const onOpen = vi.fn()
    const onError = vi.fn()
    registerPwaSQLiteFileHandler({
      onOpen,
      onError,
      target: {
        launchQueue: {
          setConsumer: (next) => {
            consumer = next
          },
        },
      },
    })

    await consumer?.({
      files: [
        {
          kind: "file",
          name: "blocked.sqlite",
          getFile: vi.fn(async () => Promise.reject(error)),
        } as unknown as FileSystemFileHandle,
      ],
    })

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error))
    expect(onOpen).not.toHaveBeenCalled()
  })
})
