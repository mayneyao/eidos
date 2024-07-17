import { lookup } from "./mime"

describe("lookup mimeType", () => {
  test("should return false for empty URL", () => {
    const url = ""
    const mimeType = lookup(url)
    expect(mimeType).toBe(false)
  })

  test("should return false for URL without extension", () => {
    const url = "https://example.com/file"
    const mimeType = lookup(url)
    expect(mimeType).toBe(false)
  })

  test("should return the correct MIME type for a known extension", () => {
    const url = "https://example.com/file.jpg"
    const mimeType = lookup(url)
    expect(mimeType).toBe("image/jpeg")
  })

  test("should return false for an unknown extension", () => {
    const url = "https://example.com/file.hashskx"
    const mimeType = lookup(url)
    expect(mimeType).toBe(false)
  })

  test("should return the correct MIME type for a known extension(only pathname)", () => {
    const url = "/path/to/file.jpg"
    const mimeType = lookup(url)
    expect(mimeType).toBe("image/jpeg")
  })
})
