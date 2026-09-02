import {
  PlaygroundOpfsImageStore,
  referencedOpfsImageFileNames,
} from "./opfs-image-store"

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
