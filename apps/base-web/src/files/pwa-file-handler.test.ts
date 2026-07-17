import {
  registerPwaBaseFileHandler,
  supportsPwaFileHandling,
  type PwaLaunchParams,
  type PwaLaunchQueue,
  type PwaLaunchTarget,
} from "./pwa-file-handler"

function fileHandle(name = "tasks.base"): FileSystemFileHandle {
  const bytes = new Uint8Array([83, 81, 76, 105, 116, 101])
  return {
    kind: "file",
    name,
    getFile: vi.fn(async () => ({
      name,
      size: bytes.byteLength,
      lastModified: 7,
      arrayBuffer: async () => bytes.buffer.slice(0),
    })),
    queryPermission: vi.fn(async () => "granted"),
  } as unknown as FileSystemFileHandle
}

describe("PWA Base file handler", () => {
  it("opens a launched file handle through the direct-file adapter", async () => {
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

    registerPwaBaseFileHandler({
      onOpen,
      onError,
      target: { launchQueue: queue },
    })
    await consumer?.({ files: [fileHandle()] })

    expect(onError).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(onOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: "tasks.base",
          mode: "direct",
          permission: "granted",
        })
      )
    })
  })

  it("reports a mismatched extension and leaves the editor untouched", async () => {
    let consumer:
      | ((params: PwaLaunchParams) => void | Promise<void>)
      | undefined
    const onOpen = vi.fn()
    const onError = vi.fn()
    registerPwaBaseFileHandler({
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

    await consumer?.({ files: [fileHandle("notes.sqlite")] })

    expect(onOpen).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining(".base") })
      )
    })
  })

  it("feature-detects launchQueue and deactivates stale consumers", async () => {
    expect(supportsPwaFileHandling({})).toBe(false)
    let consumer:
      | ((params: PwaLaunchParams) => void | Promise<void>)
      | undefined
    const onOpen = vi.fn()
    const cleanup = registerPwaBaseFileHandler({
      onOpen,
      onError: vi.fn(),
      target: {
        launchQueue: {
          setConsumer: (next) => {
            consumer = next
          },
        },
      },
    })
    cleanup()

    await consumer?.({ files: [fileHandle()] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("delivers a launch to React StrictMode's stable subscriber", async () => {
    let consumer:
      | ((params: PwaLaunchParams) => void | Promise<void>)
      | undefined
    const firstOnOpen = vi.fn()
    const setConsumer = vi.fn(
      (next: (params: PwaLaunchParams) => void | Promise<void>) => {
        consumer = next
      }
    )
    const target: PwaLaunchTarget = {
      get launchQueue() {
        return { setConsumer }
      },
    }
    const cleanup = registerPwaBaseFileHandler({
      onOpen: firstOnOpen,
      onError: vi.fn(),
      target,
    })

    await consumer?.({ files: [fileHandle()] })
    cleanup()
    const currentOnOpen = vi.fn()
    registerPwaBaseFileHandler({
      onOpen: currentOnOpen,
      onError: vi.fn(),
      target,
    })

    expect(firstOnOpen).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(currentOnOpen).toHaveBeenCalledOnce())
    expect(setConsumer).toHaveBeenCalledOnce()
  })
})
