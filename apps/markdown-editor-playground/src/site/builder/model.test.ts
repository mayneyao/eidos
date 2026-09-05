import {
  builderPlugins,
  parseBuilderConfig,
  resolveBuilder,
  startingConfig,
} from "./model"
import { obsidianPreset } from "@eidos.space/markdown/presets"
import { transpileModule } from "typescript"
import presetFixture from "../../../../../packages/markdown/tests/consumer/markdown-preset.ts?raw"
import editorFixture from "../../../../../packages/markdown/tests/consumer/Editor.tsx?raw"

describe("builder configuration", () => {
  it("adds wiki links to GFM without importing the rest of a vault preset", () => {
    const base = startingConfig("gfm")
    const result = resolveBuilder({
      ...base,
      plugins: [...base.plugins, "wikilink"],
    })
    const ids = result.preset.plugins.map((plugin) => plugin.id)
    const baseIds = resolveBuilder(base).preset.plugins.map(
      (plugin) => plugin.id
    )
    expect(ids.filter((id) => !baseIds.includes(id))).toEqual([
      "markdown.wikilink",
    ])
    expect(result.presetCode).toContain("wikilinkPlugin")
    expect(result.presetCode).not.toContain("obsidianPreset")
  })
  it("resolves the Obsidian starting point to the public preset's plugin set", () => {
    const result = resolveBuilder(startingConfig("obsidian"))
    expect(result.preset.plugins.map((plugin) => plugin.id).sort()).toEqual(
      obsidianPreset.plugins.map((plugin) => plugin.id).sort()
    )
    expect(
      parseBuilderConfig(
        JSON.stringify({
          ...startingConfig("minimal"),
          plugins: ["callout", "attachment", "vault-link"],
        })
      ).plugins
    ).toEqual(expect.arrayContaining(["quote", "image", "link"]))
  })
  it("offers wiki links independently without changing the Eidos starting point", () => {
    expect(startingConfig("eidos").plugins).not.toContain("wikilink")
    const result = resolveBuilder({
      ...startingConfig("minimal"),
      plugins: ["wikilink"],
    })
    expect(result.preset.plugins.map((plugin) => plugin.id)).toEqual([
      "eidos.source-range-editing",
      "markdown.paragraph",
      "markdown.wikilink",
    ])
    expect(result.presetCode).toContain("wikilinkPlugin")
    expect(result.example).toContain("[[")
  })
  it("validates and shares independent interaction switches", () => {
    const config = parseBuilderConfig(
      JSON.stringify({
        ...startingConfig("gfm"),
        interactions: {
          toolbar: false,
          blockDrag: true,
          blockSelection: false,
        },
      })
    )
    expect(config.interactions).toEqual({
      toolbar: false,
      blockDrag: true,
      blockSelection: false,
    })
    expect(resolveBuilder(config).componentCode).toContain(
      'interactions={{"toolbar":false,"blockDrag":true,"blockSelection":false}}'
    )
    for (const interactions of [
      { toolbar: "false" },
      { execute: true },
      [],
      null,
    ]) {
      expect(() =>
        parseBuilderConfig(
          JSON.stringify({ ...startingConfig("gfm"), interactions })
        )
      ).toThrow("Unsupported interaction")
    }
  })
  it("generates the modules checked by the isolated tarball consumer", () => {
    const result = resolveBuilder({
      schemaVersion: 1,
      plugins: ["table", "math"],
      toolbar: false,
    })
    const normalize = (source: string) =>
      transpileModule(source, {
        fileName: "Editor.tsx",
        compilerOptions: { jsx: 4 },
      }).outputText
    expect(normalize(result.presetCode)).toBe(normalize(presetFixture))
    expect(normalize(result.componentCode)).toBe(normalize(editorFixture))
  })
  it("rejects unknown and oversized configurations", () => {
    expect(() =>
      parseBuilderConfig(
        JSON.stringify({ schemaVersion: 999, plugins: [], toolbar: true })
      )
    ).toThrow()
    expect(() =>
      parseBuilderConfig(
        JSON.stringify({
          schemaVersion: 1,
          plugins: ["run-code"],
          toolbar: true,
        })
      )
    ).toThrow()
    expect(() => parseBuilderConfig(" ".repeat(8193))).toThrow()
  })
  it("normalizes duplicates and derives generated imports from resolved choices", () => {
    const config = parseBuilderConfig(
      JSON.stringify({
        schemaVersion: 1,
        plugins: ["table", "table", "math"],
        toolbar: false,
      })
    )
    expect(config.schemaVersion).toBe(2)
    expect(config.plugins).toEqual([
      "heading",
      "quote",
      "list",
      "code",
      "inline-code",
      "emphasis",
      "link",
      "divider",
      "reference",
      "table",
      "math",
    ])
    const result = resolveBuilder(config)
    expect(result.presetCode).toContain("tablePlugin, mathPlugin")
    expect(result.presetCode).not.toContain("taskListPlugin")
    expect(result.componentCode).toContain("showToolbar={false}")
    expect(result.preset.plugins.map((plugin) => plugin.id)).toContain(
      "markdown.table"
    )
    expect(result.preset.plugins.map((plugin) => plugin.id)).not.toContain(
      "eidos.image"
    )
  })
  it("resolves every available extension alone and the complete composition", () => {
    for (const plugin of builderPlugins)
      expect(() =>
        resolveBuilder({
          schemaVersion: 2,
          plugins: [plugin.id],
          toolbar: true,
        })
      ).not.toThrow()
    expect(
      resolveBuilder(startingConfig("eidos")).preset.plugins.length
    ).toBeGreaterThan(10)
  })
  it("keeps Minimal literal and expands only declared dependencies", () => {
    const minimal = startingConfig("minimal")
    expect(minimal.plugins).toEqual([])
    expect(
      resolveBuilder(minimal).preset.plugins.map((plugin) => plugin.id)
    ).toEqual(["eidos.source-range-editing", "markdown.paragraph"])
    const tasks = parseBuilderConfig(
      JSON.stringify({ ...minimal, plugins: ["task-list"] })
    )
    expect(tasks.plugins).toEqual(["list", "task-list"])
    expect(
      resolveBuilder(tasks).preset.plugins.map((plugin) => plugin.id)
    ).not.toContain("markdown.heading")
  })
})
