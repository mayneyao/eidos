import { describe, expect, it } from "vitest"

import { analyzeExtensionModuleImports } from "./imports"
import { analyzeExtensionManifest } from "./manifest"
import { createExtensionCommandTemplate } from "./template"

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
