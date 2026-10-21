const mocks = vi.hoisted(() => ({
  fileIcon: vi.fn(),
  systemIcon: vi.fn(),
}))
vi.mock("electron", () => ({
  app: { getFileIcon: mocks.fileIcon },
  nativeImage: { createFromPath: mocks.systemIcon },
}))
import { filePropertiesIconDataUrl } from "./file-properties-icon"

beforeEach(() => vi.resetAllMocks())

it("never enters the crashing asynchronous file lookup on macOS", async () => {
  const encode = vi.fn(() => "data:image/png;base64,system-icon")
  mocks.systemIcon.mockReturnValue({ isEmpty: () => false, toDataURL: encode })
  expect(await filePropertiesIconDataUrl("/space/README.md", "darwin")).toBe(
    "data:image/png;base64,system-icon"
  )
  expect(mocks.systemIcon).toHaveBeenCalledWith(
    "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns"
  )
  expect(mocks.fileIcon).not.toHaveBeenCalled()
  expect(encode).toHaveBeenCalledWith({ scaleFactor: 2 })
})

it.each(["win32", "linux"] as const)(
  "retains platform file icons on %s",
  async (platform) => {
    mocks.fileIcon.mockResolvedValue({
      isEmpty: () => false,
      toDataURL: () => "icon",
    })
    expect(await filePropertiesIconDataUrl("/space/photo.jpg", platform)).toBe(
      "icon"
    )
    expect(mocks.fileIcon).toHaveBeenCalledWith("/space/photo.jpg", {
      size: "large",
    })
    expect(mocks.systemIcon).not.toHaveBeenCalled()
  }
)

it("returns a harmless fallback when the system resource is unavailable", async () => {
  mocks.systemIcon.mockReturnValue({ isEmpty: () => true })
  expect(await filePropertiesIconDataUrl("/space/file", "darwin")).toBeNull()
  mocks.systemIcon.mockImplementation(() => {
    throw new Error("unavailable")
  })
  expect(await filePropertiesIconDataUrl("/space/file", "darwin")).toBeNull()
})
