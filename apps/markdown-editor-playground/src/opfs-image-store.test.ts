import {
  PlaygroundOpfsImageStore,
  referencedOpfsImageFileNames,
} from "./opfs-image-store"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("OPFS asynchronous lifetime", () => {
  const markdownUrl =
    "opfs://markdown-editor-playground/images/123e4567-e89b-12d3-a456-426614174000.png"
  const originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage")
  const createObjectURL = vi.fn(() => "blob:test")
  const revokeObjectURL = vi.fn()
  function install(directory: object) {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        getDirectory: async () => ({
          getDirectoryHandle: async () => ({
            getDirectoryHandle: async () => directory,
          }),
        }),
      },
    })
  }
  beforeEach(() => {
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalStorage)
      Object.defineProperty(navigator, "storage", originalStorage)
    else Reflect.deleteProperty(navigator, "storage")
  })

  it("does not create a late blob URL after disposal and can serve a new lifetime", async () => {
    const entered = deferred<void>()
    const read = deferred<File>()
    install({
      getFileHandle: async () => ({
        getFile: () => {
          entered.resolve()
          return read.promise
        },
      }),
    })
    const store = new PlaygroundOpfsImageStore()
    const request = {
      markdownUrl,
      documentKey: "test",
      signal: new AbortController().signal,
    }
    const pending = store.resolveImageUrl(request)
    await entered.promise
    store.dispose()
    read.resolve(new File(["image"], "image.png"))
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(createObjectURL).not.toHaveBeenCalled()
    await expect(store.resolveImageUrl(request)).resolves.toBe("blob:test")
    store.dispose()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test")
  })

  it.each(["dispose", "abort"] as const)(
    "cleans a pending paste when %s happens during close",
    async (action) => {
      const entered = deferred<void>()
      const close = deferred<void>()
      const removeEntry = vi.fn(async () => undefined)
      const writable = {
        write: vi.fn(async () => undefined),
        close: () => {
          entered.resolve()
          return close.promise
        },
        abort: vi.fn(async () => undefined),
      }
      install({
        getFileHandle: async () => ({ createWritable: async () => writable }),
        removeEntry,
      })
      const store = new PlaygroundOpfsImageStore()
      const controller = new AbortController()
      const pending = store.persistImage({
        index: 0,
        total: 1,
        file: new File(["image"], "image.png", { type: "image/png" }),
        documentKey: "test",
        signal: controller.signal,
      })
      await entered.promise
      if (action === "dispose") store.dispose()
      else controller.abort()
      close.resolve()
      await expect(pending).rejects.toMatchObject({ name: "AbortError" })
      expect(removeEntry).toHaveBeenCalledOnce()
      expect(createObjectURL).not.toHaveBeenCalled()
    }
  )

  it("removes a newly created entry when opening its write stream fails", async () => {
    const failure = new Error("Quota unavailable")
    const removeEntry = vi.fn(async () => undefined)
    install({
      getFileHandle: async () => ({
        createWritable: async () => {
          throw failure
        },
      }),
      removeEntry,
    })
    const store = new PlaygroundOpfsImageStore()
    await expect(
      store.persistImage({
        index: 0,
        total: 1,
        file: new File(["image"], "image.png"),
        documentKey: "test",
        signal: new AbortController().signal,
      })
    ).rejects.toBe(failure)
    expect(removeEntry).toHaveBeenCalledOnce()
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})

describe("OPFS image references", () => {
  it("collects only playground-owned image files", () => {
    expect(
      referencedOpfsImageFileNames(`![One](<opfs://markdown-editor-playground/images/123e4567-e89b-12d3-a456-426614174000.png>)

![External](https://eidos.space/image.png)

![Two](opfs://markdown-editor-playground/images/223e4567-e89b-12d3-a456-426614174000.webp)`)
    ).toEqual(
      new Set([
        "123e4567-e89b-12d3-a456-426614174000.png",
        "223e4567-e89b-12d3-a456-426614174000.webp",
      ])
    )
  })

  it("sweeps only old, unreferenced playground images", async () => {
    const referenced = "123e4567-e89b-12d3-a456-426614174000.png"
    const orphan = "223e4567-e89b-12d3-a456-426614174000.png"
    const removeEntry = vi.fn(async () => undefined)
    const imageDirectory = {
      async *entries() {
        yield [
          referenced,
          {
            kind: "file",
            getFile: async () => new File(["kept"], referenced),
          },
        ]
        yield [
          orphan,
          {
            kind: "file",
            getFile: async () =>
              new File(["removed"], orphan, { lastModified: 1 }),
          },
        ]
      },
      removeEntry,
    }
    const appDirectory = {
      getDirectoryHandle: async () => imageDirectory,
    }
    const rootDirectory = {
      getDirectoryHandle: async () => appDirectory,
    }
    const originalStorage = navigator.storage
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { getDirectory: async () => rootDirectory },
    })

    try {
      const store = new PlaygroundOpfsImageStore()
      await store.sweepUnusedImages(
        `![Kept](<opfs://markdown-editor-playground/images/${referenced}>)`,
        { minimumAgeMs: 100, now: 1_000 }
      )
      expect(removeEntry).toHaveBeenCalledOnce()
      expect(removeEntry).toHaveBeenCalledWith(orphan)
    } finally {
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: originalStorage,
      })
    }
  })
})
