import {
  openEidosFileHandle,
  openImportedEidosFile,
  queryWritePermission,
  requestWritePermission,
  sameFileVersion,
  writeAndVerifyHandle,
} from "./browser-file-adapter"

function fileFrom(bytes: Uint8Array, lastModified = 1): File {
  const copy = new Uint8Array(bytes)
  return {
    name: "tasks.eidos",
    size: copy.byteLength,
    lastModified,
    arrayBuffer: async () => copy.buffer.slice(0),
  } as File
}

describe("browser Eidos File adapter", () => {
  it("reports denied permission when permission APIs fail", async () => {
    const handle = {
      queryPermission: vi.fn().mockRejectedValue(new DOMException("no")),
      requestPermission: vi.fn().mockRejectedValue(new DOMException("no")),
    } as unknown as FileSystemFileHandle
    await expect(queryWritePermission(handle)).resolves.toBe("denied")
    await expect(requestWritePermission(handle)).resolves.toBe("denied")
  })

  it("rejects legacy suffixes across handle and copy imports", async () => {
    const legacy = {
      ...fileFrom(new Uint8Array([1, 2, 3])),
      name: "tasks.base",
    } as File
    const handle = {
      getFile: vi.fn(async () => legacy),
    } as unknown as FileSystemFileHandle

    await expect(openEidosFileHandle(handle)).rejects.toThrow(
      "Choose a .eidos file"
    )
    await expect(openImportedEidosFile(legacy)).rejects.toThrow(
      "Choose a .eidos file"
    )
  })

  it("writes, closes and verifies the resulting bytes", async () => {
    let current = new Uint8Array([1, 2, 3])
    const writable = {
      write: vi.fn(async (value: Uint8Array) => {
        current = new Uint8Array(value)
      }),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    }
    const handle = {
      createWritable: vi.fn(async () => writable),
      getFile: vi.fn(async () => fileFrom(current, 2)),
    } as unknown as FileSystemFileHandle
    const version = await writeAndVerifyHandle(
      handle,
      new Uint8Array([4, 5, 6])
    )
    expect(writable.write).toHaveBeenCalledOnce()
    expect(writable.close).toHaveBeenCalledOnce()
    expect(version.size).toBe(3)
  })

  it("keeps distinct content versions distinct even with matching metadata", () => {
    expect(
      sameFileVersion(
        { size: 4, lastModified: 10, digest: "one" },
        { size: 4, lastModified: 10, digest: "two" }
      )
    ).toBe(false)
  })

  it("aborts a failed write and preserves the original failure", async () => {
    const failure = new Error("Disk full")
    const writable = {
      write: vi.fn().mockRejectedValue(failure),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    }
    const handle = {
      createWritable: vi.fn(async () => writable),
    } as unknown as FileSystemFileHandle

    await expect(
      writeAndVerifyHandle(handle, new Uint8Array([7, 8, 9]))
    ).rejects.toBe(failure)
    expect(writable.abort).toHaveBeenCalledOnce()
    expect(writable.close).not.toHaveBeenCalled()
  })

  it("rejects a completed write when readback bytes do not match", async () => {
    const writable = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    }
    const handle = {
      createWritable: vi.fn(async () => writable),
      getFile: vi.fn(async () => fileFrom(new Uint8Array([0, 0, 0]), 3)),
    } as unknown as FileSystemFileHandle

    await expect(
      writeAndVerifyHandle(handle, new Uint8Array([1, 2, 3]))
    ).rejects.toThrow("bytes on disk do not match")
  })
})
