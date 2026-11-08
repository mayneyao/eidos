import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { readExplorerFileThumbnail } from "./explorer-file-thumbnail"
import { normalizeExplorerThumbnailRequest } from "../../shared/explorer-media"

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "explorer-thumbnail-"))
  )
  roots.push(root)
  const file = path.join(root, "photo.jpg")
  await fs.writeFile(file, "fixture image")
  const stats = await fs.stat(file)
  const request = {
    spaceId: "space",
    relativePath: "photo.jpg",
    size: stats.size,
    modifiedAtMs: stats.mtimeMs,
    pixelSize: 112,
  }
  return { root, file, stats, request }
}

it("requests a bounded system thumbnail with verified file identity and no original-file URL", async () => {
  const { root, file, stats, request } = await fixture()
  const provider = vi.fn(async () => new Uint8Array([137, 80, 78, 71]))
  expect(await readExplorerFileThumbnail(root, request, provider)).toBe(
    "data:image/png;base64,iVBORw=="
  )
  expect(provider).toHaveBeenCalledWith(
    file,
    {
      device: stats.dev,
      inode: stats.ino,
      size: stats.size,
      modifiedAtMs: stats.mtimeMs,
    },
    512
  )
  expect(
    await readExplorerFileThumbnail(
      root,
      { ...request, modifiedAtMs: stats.mtimeMs - 1 },
      provider
    )
  ).toBeNull()
  expect(provider).toHaveBeenCalledTimes(1)
})

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = Buffer.alloc(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  bytes.writeUInt32BE(13, 8)
  bytes.write("IHDR", 12)
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

it("uses physical pixels and upgrades panoramic images until their cropped short edge is sharp", async () => {
  const { root, request } = await fixture()
  const provider = vi.fn(
    async (_path: string, _identity: unknown, size: number = 128) =>
      pngHeader(size, size / 8)
  )
  const thumbnail = await readExplorerFileThumbnail(root, request, provider)
  expect(provider.mock.calls.map((call) => call[2])).toEqual([512, 1024])
  expect(thumbnail).toBe(
    "data:image/png;base64," +
      Buffer.from(pngHeader(1024, 128)).toString("base64")
  )
  provider.mockClear()
  expect(
    await readExplorerFileThumbnail(
      root,
      { ...request, pixelSize: 56 },
      async (file, identity, size) => {
        return provider(file, identity, size).then(() => pngHeader(128, 85))
      }
    )
  ).not.toBeNull()
  expect(provider.mock.calls.map((call) => call[2])).toEqual([128])
})

it("retains a usable thumbnail when a larger system preview fails and does not enlarge tiny originals", async () => {
  const { root, request } = await fixture()
  const provider = vi
    .fn()
    .mockResolvedValueOnce(pngHeader(512, 64))
    .mockRejectedValueOnce(Error("No larger preview"))
  expect(await readExplorerFileThumbnail(root, request, provider)).toBe(
    "data:image/png;base64," +
      Buffer.from(pngHeader(512, 64)).toString("base64")
  )
  expect(provider).toHaveBeenCalledTimes(2)
  const tiny = vi.fn(async () => pngHeader(20, 10))
  expect(await readExplorerFileThumbnail(root, request, tiny)).not.toBeNull()
  expect(tiny).toHaveBeenCalledOnce()
})

it("rejects traversal, symlink files and symlink parent directories before generation", async () => {
  const { root, request } = await fixture()
  const provider = vi.fn(async () => new Uint8Array([1]))
  await expect(
    readExplorerFileThumbnail(
      root,
      { ...request, relativePath: "../photo.jpg" },
      provider
    )
  ).rejects.toThrow()
  await fs.symlink(path.join(root, "photo.jpg"), path.join(root, "link.jpg"))
  await expect(
    readExplorerFileThumbnail(
      root,
      { ...request, relativePath: "link.jpg" },
      provider
    )
  ).rejects.toThrow()
  await fs.mkdir(path.join(root, "real"))
  await fs.writeFile(path.join(root, "real", "photo.jpg"), "fixture image")
  await fs.symlink(path.join(root, "real"), path.join(root, "alias"))
  await expect(
    readExplorerFileThumbnail(
      root,
      { ...request, relativePath: "alias/photo.jpg" },
      provider
    )
  ).rejects.toThrow()
  expect(provider).not.toHaveBeenCalled()
})

it("discards a thumbnail if the original changes in flight and falls back on native failures", async () => {
  const { root, file, request } = await fixture()
  let complete!: (bytes: Uint8Array) => void
  const provider = vi.fn(
    () =>
      new Promise<Uint8Array>((resolve) => {
        complete = resolve
      })
  )
  const pending = readExplorerFileThumbnail(root, request, provider)
  await vi.waitFor(() => expect(provider).toHaveBeenCalled())
  await fs.writeFile(file, "changed file contents")
  complete(new Uint8Array([1, 2]))
  expect(await pending).toBeNull()
  const stats = await fs.stat(file)
  const next = { ...request, size: stats.size, modifiedAtMs: stats.mtimeMs }
  expect(
    await readExplorerFileThumbnail(root, next, async () => {
      throw Error("Unavailable")
    })
  ).toBeNull()
  expect(
    await readExplorerFileThumbnail(
      root,
      next,
      async () => new Uint8Array(4 * 1024 * 1024 + 65537)
    )
  ).toBeNull()
})

it("does not request thumbnails for data files or unsupported hosts and validates IPC metadata", async () => {
  const { root, request } = await fixture()
  const provider = vi.fn(async () => new Uint8Array([1]))
  expect(
    await readExplorerFileThumbnail(
      root,
      { ...request, relativePath: "data.json" },
      provider
    )
  ).toBeNull()
  expect(await readExplorerFileThumbnail(root, request, undefined)).toBeNull()
  expect(provider).not.toHaveBeenCalled()
  for (const bad of [
    null,
    {},
    { ...request, size: -1 },
    { ...request, modifiedAtMs: NaN },
    { ...request, relativePath: 1 },
    { ...request, pixelSize: 8192 },
    { ...request, pixelSize: NaN },
    { ...request, pixelSize: 12.5 },
  ])
    expect(() => normalizeExplorerThumbnailRequest(bad)).toThrow()
  expect(normalizeExplorerThumbnailRequest(request)).toEqual(request)
})
