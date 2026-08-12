import { fileManagerMessage } from "./platform-copy"

describe("platform-specific copy", () => {
  it("uses the native file manager name where the platform has one", () => {
    expect(fileManagerMessage("darwin")).toBe("Reveal in Finder")
    expect(fileManagerMessage("win32")).toBe("Show in File Explorer")
    expect(fileManagerMessage("linux")).toBe("Show in File Manager")
  })
})
