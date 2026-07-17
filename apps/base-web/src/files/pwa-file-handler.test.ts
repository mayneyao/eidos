import {
  registerPwaBaseFileHandler,
  supportsPwaFileHandling,
  type PwaLaunchParams,
  type PwaLaunchQueue,
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
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "tasks.base",
        mode: "direct",
        permission: "granted",
      })
    )
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
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining(".base") })
    )
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
    expect(onOpen).not.toHaveBeenCalled()
  })
})
