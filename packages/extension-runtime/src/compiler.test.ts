import { describe, expect, it } from "vitest"
import { compileExtensionWorker } from "./compiler"

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
    ).rejects.toThrow("Unsupported or missing extension import")
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
