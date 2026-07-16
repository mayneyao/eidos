import { describe, expect, it } from "vitest"
import {
  compileExtensionSurface,
  compileExtensionWorker,
  ExtensionCompileError,
} from "./compiler"

const bytes = (value: string) => new TextEncoder().encode(value)

describe("compileExtensionWorker", () => {
  it("bundles one inspected TypeScript graph without filesystem access", async () => {
    const result = await compileExtensionWorker({
      entrypoint: "src/extension.ts",
      files: [
        {
          path: "src/extension.ts",
          content: bytes(
            [
              'import type { ExtensionContext } from "@eidos.space/extension-sdk"',
              'import { message } from "./message"',
              "export function activate(context: ExtensionContext) {",
              '  context.commands.register("example.hello", () => context.window.showNotice(message))',
              "}",
            ].join("\n")
          ),
        },
        {
          path: "src/message.ts",
          content: bytes('export const message: string = "hello"'),
        },
      ],
    })

    expect(result.entrypoint).toBe("src/extension.ts")
    expect(result.code).toContain("__eidosExtensionModule")
    expect(result.code).toContain("example.hello")
    expect(result.code).toContain("hello")
    expect(result.code).not.toContain("@eidos.space/extension-sdk")
  })

  it("rejects imports that are absent from the supplied snapshot", async () => {
    await expect(
      compileExtensionWorker({
        entrypoint: "src/extension.ts",
        files: [
          {
            path: "src/extension.ts",
            content: bytes('import "./missing"'),
          },
        ],
      })
    ).rejects.toMatchObject({
      name: "ExtensionCompileError",
      message: "Unsupported or missing extension import: ./missing",
      path: "src/extension.ts",
    })
  })

  it("reports the imported source location for syntax errors", async () => {
    const compilation = compileExtensionWorker({
      entrypoint: "src/extension.ts",
      files: [
        {
          path: "src/extension.ts",
          content: bytes('import { value } from "./helper"; export { value }'),
        },
        {
          path: "src/helper.ts",
          content: bytes("const label = '任务'\nexport const value = ;\n"),
        },
      ],
    })

    await expect(compilation).rejects.toBeInstanceOf(ExtensionCompileError)
    await expect(compilation).rejects.toMatchObject({
      message: "Unexpected token",
      path: "src/helper.ts",
      line: 2,
      column: 22,
    })
  })

  it("rejects worker CSS even when it exists in the package snapshot", async () => {
    await expect(
      compileExtensionWorker({
        entrypoint: "src/extension.ts",
        files: [
          {
            path: "src/extension.ts",
            content: bytes('import "./style.css"'),
          },
          { path: "src/style.css", content: bytes("body {}") },
        ],
      })
    ).rejects.toThrow("Worker modules do not support .css")
  })
})

describe("compileExtensionSurface", () => {
  it("bundles DOM UI and package-local CSS from the inspected snapshot", async () => {
    const result = await compileExtensionSurface({
      entrypoint: "src/editor.ts",
      files: [
        {
          path: "src/editor.ts",
          content: bytes(
            [
              'import type { ExtensionFileEditorContext } from "@eidos.space/extension-sdk"',
              'import "./editor.css"',
              "export function activate(context: ExtensionFileEditorContext) {",
              "  context.root.textContent = context.document.snapshot.text",
              "}",
            ].join("\n")
          ),
        },
        {
          path: "src/editor.css",
          content: bytes(".task { color: var(--eidos-color-foreground); }"),
        },
      ],
    })

    expect(result.code).toContain("document.createElement")
    expect(result.code).toContain("--eidos-color-foreground")
    expect(result.code).toContain("context.document.snapshot.text")
    expect(result.code).not.toContain("@eidos.space/extension-sdk")
  })
})
