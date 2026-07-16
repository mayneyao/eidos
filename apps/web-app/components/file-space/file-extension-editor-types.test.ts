import { describe, expect, it, vi } from "vitest"

import {
  configureFileExtensionEditorTypes,
  isFileExtensionSourcePath,
} from "./file-extension-editor-types"

function createMonacoFixture() {
  const extraLibs: Record<string, { content: string }> = {}
  const compilerOptions = {
    paths: { "existing/*": ["existing/*"] },
    strict: true,
  }
  const defaults = {
    addExtraLib: vi.fn((content: string, filePath: string) => {
      extraLibs[filePath] = { content }
      return { dispose: vi.fn() }
    }),
    getCompilerOptions: vi.fn(() => compilerOptions),
    getExtraLibs: vi.fn(() => extraLibs),
    setCompilerOptions: vi.fn(),
  }
  const monaco = {
    languages: {
      typescript: {
        javascriptDefaults: defaults,
        typescriptDefaults: defaults,
        ModuleKind: { ESNext: 99 },
        ModuleResolutionKind: { NodeJs: 2 },
      },
    },
  }

  return { defaults, monaco }
}

describe("file extension editor types", () => {
  it("recognizes only files inside the visible extension package root", () => {
    expect(
      isFileExtensionSourcePath(
        ".eidos/extensions/local.task-counter/src/extension.ts"
      )
    ).toBe(true)
    expect(
      isFileExtensionSourcePath(
        "./.eidos/extensions/local.task-counter/src/panel.ts"
      )
    ).toBe(true)
    expect(isFileExtensionSourcePath(".eidos/state/extensions.json")).toBe(
      false
    )
    expect(isFileExtensionSourcePath("notes/extension.ts")).toBe(false)
  })

  it("registers the canonical SDK sources and Node module mappings", () => {
    const { defaults, monaco } = createMonacoFixture()

    configureFileExtensionEditorTypes(
      monaco as never,
      ".eidos/extensions/local.task-counter/src/extension.ts"
    )

    expect(defaults.addExtraLib).toHaveBeenCalledWith(
      expect.stringContaining("export interface ExtensionContext"),
      "file:///node_modules/@eidos.space/extension-sdk/index.ts"
    )
    expect(defaults.addExtraLib).toHaveBeenCalledWith(
      expect.stringContaining("export interface ExtensionSurfaceAppearance"),
      "file:///node_modules/@eidos.space/extension-surface-protocol/index.ts"
    )
    expect(defaults.setCompilerOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        allowNonTsExtensions: true,
        baseUrl: "file:///",
        module: 99,
        moduleResolution: 2,
        paths: {
          "existing/*": ["existing/*"],
          "@eidos.space/extension-sdk": [
            "node_modules/@eidos.space/extension-sdk/index.ts",
          ],
          "@eidos.space/extension-surface-protocol": [
            "node_modules/@eidos.space/extension-surface-protocol/index.ts",
          ],
        },
        strict: true,
      })
    )
  })

  it("does not change Monaco defaults for ordinary Space files", () => {
    const { defaults, monaco } = createMonacoFixture()

    configureFileExtensionEditorTypes(monaco as never, "notes/example.ts")

    expect(defaults.addExtraLib).not.toHaveBeenCalled()
    expect(defaults.setCompilerOptions).not.toHaveBeenCalled()
  })
})
