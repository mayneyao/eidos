import { describe, expect, it, vi } from "vitest"

import {
  configureFileExtensionEditorTypes,
  fileExtensionEditorUri,
  fileExtensionPackageRoot,
  isFileExtensionSourcePath,
  loadFileExtensionEditorPackage,
  syncFileExtensionEditorPackageTypes,
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
        JsxEmit: { ReactJSX: 4 },
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
        allowJs: true,
        allowNonTsExtensions: true,
        baseUrl: "file:///",
        checkJs: false,
        jsx: 4,
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
        resolveJsonModule: true,
        strict: true,
      })
    )
  })

  it("derives stable package roots and model URIs", () => {
    expect(
      fileExtensionPackageRoot(
        ".eidos/extensions/local.task-counter/src/extension.ts"
      )
    ).toBe(".eidos/extensions/local.task-counter")
    expect(fileExtensionPackageRoot(".eidos/extensions/")).toBeNull()
    expect(fileExtensionPackageRoot("notes/extension.ts")).toBeNull()
    expect(
      fileExtensionEditorUri(
        "My Space",
        ".eidos/extensions/local.task-counter/src/task editor.ts"
      )
    ).toBe(
      "file:///eidos-spaces/My%20Space/.eidos/extensions/local.task-counter/src/task%20editor.ts"
    )
    expect(fileExtensionEditorUri("space-a", "notes/example.ts")).toBe(
      undefined
    )
  })

  it("loads bounded package modules recursively and skips dependency trees", async () => {
    const list = vi.fn(async (directory: string) => {
      if (directory === ".eidos/extensions/local.example") {
        return [
          {
            name: "extension.json",
            path: `${directory}/extension.json`,
            parentPath: directory,
            kind: "file" as const,
            size: 20,
            mtimeMs: 1,
          },
          {
            name: "node_modules",
            path: `${directory}/node_modules`,
            parentPath: directory,
            kind: "directory" as const,
            size: 0,
            mtimeMs: 1,
          },
          {
            name: "src",
            path: `${directory}/src`,
            parentPath: directory,
            kind: "directory" as const,
            size: 0,
            mtimeMs: 1,
          },
        ]
      }
      if (directory === ".eidos/extensions/local.example/src") {
        return [
          {
            name: "editor.css",
            path: `${directory}/editor.css`,
            parentPath: directory,
            kind: "file" as const,
            size: 12,
            mtimeMs: 1,
          },
          {
            name: "tasks.ts",
            path: `${directory}/tasks.ts`,
            parentPath: directory,
            kind: "file" as const,
            size: 24,
            mtimeMs: 1,
          },
        ]
      }
      throw new Error(`Unexpected directory: ${directory}`)
    })
    const readText = vi.fn(async (path: string) => ({
      path,
      content: path.endsWith(".json") ? '{"name":"example"}' : "export {}\n",
      contentDigest: "sha256:test",
      size: 10,
      mtimeMs: 1,
    }))

    const editorPackage = await loadFileExtensionEditorPackage(
      { list, readText },
      ".eidos/extensions/local.example/src/extension.ts"
    )

    expect(editorPackage).toEqual({
      rootPath: ".eidos/extensions/local.example",
      sources: [
        {
          path: ".eidos/extensions/local.example/extension.json",
          content: '{"name":"example"}',
        },
        {
          path: ".eidos/extensions/local.example/src/tasks.ts",
          content: "export {}\n",
        },
      ],
      warnings: [],
    })
    expect(list).not.toHaveBeenCalledWith(
      ".eidos/extensions/local.example/node_modules",
      expect.anything()
    )
    expect(readText).not.toHaveBeenCalledWith(
      ".eidos/extensions/local.example/src/editor.css"
    )
  })

  it("registers package modules at the same virtual paths used by models", () => {
    const { defaults, monaco } = createMonacoFixture()

    syncFileExtensionEditorPackageTypes(monaco as never, "space-a", {
      rootPath: ".eidos/extensions/local.example",
      sources: [
        {
          path: ".eidos/extensions/local.example/src/tasks.ts",
          content: "export const tasks = []\n",
        },
      ],
      warnings: [],
    })

    expect(defaults.addExtraLib).toHaveBeenCalledWith(
      "export const tasks = []\n",
      "file:///eidos-spaces/space-a/.eidos/extensions/local.example/src/tasks.ts"
    )
  })

  it("does not change Monaco defaults for ordinary Space files", () => {
    const { defaults, monaco } = createMonacoFixture()

    configureFileExtensionEditorTypes(monaco as never, "notes/example.ts")

    expect(defaults.addExtraLib).not.toHaveBeenCalled()
    expect(defaults.setCompilerOptions).not.toHaveBeenCalled()
  })
})
