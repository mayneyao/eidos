import { createWebFetchTools } from "./web-tools"

class MockBash {
  private files = new Map<string, string>()

  readFile(path: string): string {
    const content = this.files.get(path)
    if (content === undefined) {
      throw new Error(`ENOENT: no such file, '${path}'`)
    }
    return content
  }

  writeFile(path: string, content: string): void {
    this.files.set(path, content)
  }
}

describe("web-tools", () => {
  let fs: MockBash
  let tools: Record<string, any>

  beforeEach(() => {
    fs = new MockBash()
    tools = createWebFetchTools(fs as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockFetchText(content: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-type" ? "text/plain" : null,
        },
        text: async () => content,
      })
    )
  }

  it("truncates large content when returning it directly", async () => {
    const content = "x".repeat(30001)
    mockFetchText(content)

    const result = await tools["web-fetch"].execute({
      url: "https://example.com/large.txt",
    })

    expect(result.content).toHaveLength(
      30000 + "\n\n[Content truncated]".length
    )
    expect(result.content.endsWith("[Content truncated]")).toBe(true)
  })

  it("writes full content when outputPath is provided", async () => {
    const content = "x".repeat(30001)
    mockFetchText(content)

    const result = await tools["web-fetch"].execute({
      url: "https://example.com/large.txt",
      outputPath: "/tmp/large.txt",
    })

    expect(result.savedTo).toBe("/tmp/large.txt")
    expect(result.content).toBeUndefined()
    expect(fs.readFile("/tmp/large.txt")).toBe(content)
    expect(fs.readFile("/tmp/large.txt")).not.toContain("[Content truncated]")
  })
})
