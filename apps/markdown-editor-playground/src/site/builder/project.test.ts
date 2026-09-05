import { projectFiles, integrationFiles } from "./project"
import { startingConfig, parseBuilderConfig, resolveBuilder } from "./model"
import { zipFiles } from "./zip"

describe("exported project", () => {
  it("includes image storage when images are enabled through a dependency", () => {
    const files = projectFiles({
      schemaVersion: 2,
      plugins: ["attachment"],
      toolbar: false,
      imageStorage: "opfs",
    })
    expect(files["src/Editor.tsx"]).toContain("{...images}")
    expect(files["src/image-storage.ts"]).toBeDefined()
    expect(files["src/opfs-image-store.ts"]).toBeDefined()
    expect(
      resolveBuilder({
        schemaVersion: 2,
        plugins: ["attachment"],
        toolbar: false,
      }).usesImages
    ).toBe(true)
  })
  it("includes exact integration files and local tarball installation", () => {
    const config = { ...startingConfig("gfm"), imageStorage: "opfs" as const }
    const files = projectFiles(config)
    for (const [name, content] of Object.entries(integrationFiles(config)))
      expect(files[`src/${name}`]).toBe(content)
    expect(
      JSON.parse(files["package.json"]).dependencies["@eidos.space/markdown"]
    ).toBe("file:./vendor/markdown.tgz")
    expect(files["src/Editor.tsx"]).toContain("{...images}")
    expect(files["src/image-storage.ts"]).toContain("store.dispose()")
    expect(files["src/opfs-image-store.ts"]).toContain("AbortError")
    expect(files["README.md"]).toContain("document is not included")
    const compiler = JSON.parse(files["tsconfig.json"]).compilerOptions
    expect(compiler.lib).toContain("ESNext.Disposable")
    expect(compiler.skipLibCheck).toBe(false)
  })
  it("omits adapters when the corresponding syntax is disabled", () => {
    const files = projectFiles({
      schemaVersion: 1,
      plugins: [],
      toolbar: false,
      imageStorage: "opfs",
    })
    expect(files["src/image-storage.ts"]).toBeUndefined()
    expect(files["src/Editor.tsx"]).not.toContain("images")
  })
  it("validates host configuration and archive paths", () => {
    expect(() =>
      parseBuilderConfig(
        JSON.stringify({
          ...startingConfig("gfm"),
          imageStorage: "remote-code",
        })
      )
    ).toThrow("Unsupported image storage")
    expect(() => zipFiles({ "../escape": "content" })).toThrow("Unsafe")
    expect(() => zipFiles({ "/absolute": "content" })).toThrow("Unsafe")
    expect(zipFiles({ "src/文档.md": "中文" }).type).toBe("application/zip")
  })
})
