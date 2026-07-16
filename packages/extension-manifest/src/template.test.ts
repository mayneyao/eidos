import { describe, expect, it } from "vitest"

import { analyzeExtensionModuleImports } from "./imports"
import { analyzeExtensionManifest } from "./manifest"
import {
  createExtensionCommandTemplate,
  createExtensionPanelTemplate,
  createExtensionTextEditorTemplate,
} from "./template"

describe("createExtensionCommandTemplate", () => {
  it("creates a self-consistent local command package", () => {
    const template = createExtensionCommandTemplate({
      publisher: "local",
      name: "hello-tools",
      engineRange: ">=0.33.0",
    })

    expect(template.canonicalId).toBe("local.hello-tools")
    expect(template.files.map((file) => file.path)).toEqual([
      "extension.json",
      "src/extension.ts",
      "README.md",
    ])
    expect(template.manifest.contributes).toMatchObject({
      commands: [
        {
          id: "local.hello-tools.hello",
          title: "Hello from Hello Tools",
        },
      ],
      menus: {
        "files/context": [
          {
            command: "local.hello-tools.hello",
            when: "resourceIsDirectory == false",
            group: "extensions",
          },
        ],
      },
    })
    expect(
      analyzeExtensionManifest(
        template.files.find((file) => file.path === "extension.json")!.content,
        {
          packageDirectoryName: template.canonicalId,
          hostVersion: "0.33.0",
        }
      )
    ).toMatchObject({ valid: true, compatible: true })

    const source = template.files.find(
      (file) => file.path === "src/extension.ts"
    )!.content
    expect(
      analyzeExtensionModuleImports(
        "src/extension.ts",
        source,
        new Set(template.files.map((file) => file.path))
      )
    ).toEqual([])
    expect(source).toContain("local.hello-tools.hello")
    expect(
      template.files.find((file) => file.path === "README.md")!.content
    ).toContain("Command Palette and file context menu")
  })

  it.each(["A", "UPPERCASE", "has spaces", "-leading", "a"])(
    "rejects invalid package name %s",
    (name) => {
      expect(() =>
        createExtensionCommandTemplate({
          publisher: "local",
          name,
          engineRange: ">=0.33.0",
        })
      ).toThrow("Extension name")
    }
  )
})

describe("createExtensionPanelTemplate", () => {
  it("creates a command-driven Task Counter panel package", () => {
    const template = createExtensionPanelTemplate({
      publisher: "local",
      name: "task-counter",
      engineRange: ">=0.33.0",
    })

    expect(template.files.map((file) => file.path)).toEqual([
      "extension.json",
      "src/extension.ts",
      "src/panel.ts",
      "src/panel.css",
      "README.md",
    ])
    expect(template.manifest).toMatchObject({
      entrypoints: {
        worker: "src/extension.ts",
        ui: "src/panel.ts",
      },
      contributes: {
        commands: [{ id: "local.task-counter.open-summary" }],
        panels: [
          {
            id: "local.task-counter.summary",
            displayName: "Task Counter",
          },
        ],
        menus: {
          "files/context": [
            {
              command: "local.task-counter.open-summary",
              when: "resourceExtname == .md && resourceIsDirectory == false",
            },
            {
              command: "local.task-counter.open-summary",
              when: "resourceExtname == .markdown && resourceIsDirectory == false",
            },
          ],
        },
      },
      permissions: {
        files: { read: ["**/*.md", "**/*.markdown"], write: [] },
      },
    })
    const files = new Set(template.files.map((file) => file.path))
    for (const entrypoint of ["src/extension.ts", "src/panel.ts"]) {
      const source = template.files.find(
        (file) => file.path === entrypoint
      )!.content
      expect(analyzeExtensionModuleImports(entrypoint, source, files)).toEqual(
        []
      )
    }
    expect(
      template.files.find((file) => file.path === "src/extension.ts")!.content
    ).toContain("context.window.openPanel")
    expect(
      template.files.find((file) => file.path === "src/panel.ts")!.content
    ).toContain("context.state ??")
  })
})

describe("createExtensionTextEditorTemplate", () => {
  it("creates a self-consistent editable text package", () => {
    const template = createExtensionTextEditorTemplate({
      publisher: "example",
      name: "notes-editor",
      displayName: "Notes Editor",
      engineRange: ">=0.33.0",
      filenamePattern: "**/*.notes.md",
    })

    expect(template.canonicalId).toBe("example.notes-editor")
    expect(template.files.map((file) => file.path)).toEqual([
      "extension.json",
      "src/editor.ts",
      "src/editor.css",
      "README.md",
    ])
    expect(template.manifest).toMatchObject({
      entrypoints: { ui: "src/editor.ts" },
      contributes: {
        fileEditors: [
          {
            id: "example.notes-editor.editor",
            priority: "option",
            selector: [
              {
                filenamePattern: "**/*.notes.md",
                mediaType: "text/markdown",
              },
            ],
          },
        ],
      },
      permissions: {
        files: {
          read: ["**/*.notes.md"],
          write: ["**/*.notes.md"],
        },
      },
    })

    const source = template.files.find(
      (file) => file.path === "src/editor.ts"
    )!.content
    expect(
      analyzeExtensionModuleImports(
        "src/editor.ts",
        source,
        new Set(template.files.map((file) => file.path))
      )
    ).toEqual([])
    expect(source).toContain("context.document.applyEdits")
    expect(source).toContain("minimalEdit")
  })
})
