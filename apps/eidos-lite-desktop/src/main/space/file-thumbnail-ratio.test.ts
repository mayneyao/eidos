import { generateSystemFileThumbnail } from "./file-thumbnails"

const mocks = vi.hoisted(() => ({
  createThumbnailFromPath: vi.fn(),
  createFromBuffer: vi.fn(),
}))
vi.mock("electron", () => ({ nativeImage: mocks }))

describe("system thumbnail pixel aspect ratio", () => {
  it.each([
    [256, 144, { width: 128 }],
    [144, 256, { height: 128 }],
    [256, 256, { width: 128 }],
  ])(
    "normalizes logical square metadata before resizing %ix%i pixels",
    async (width, height, options) => {
      const originalPng = Buffer.from("original native pixels")
      const output = Buffer.from("bounded pixels")
      const logicalSize = vi.fn(() => ({ width: 128, height: 128 }))
      mocks.createThumbnailFromPath.mockResolvedValue({
        isEmpty: () => false,
        getSize: logicalSize,
        toPNG: () => originalPng,
      })
      const resize = vi.fn(() => ({ toPNG: () => output }))
      mocks.createFromBuffer.mockReturnValue({
        isEmpty: () => false,
        getSize: () => ({ width, height }),
        resize,
      })
      expect(await generateSystemFileThumbnail("/clip.mp4", 128)).toEqual(
        output
      )
      expect(mocks.createFromBuffer).toHaveBeenCalledWith(originalPng)
      expect(logicalSize).not.toHaveBeenCalled()
      expect(resize).toHaveBeenCalledWith(options)
    }
  )
})
