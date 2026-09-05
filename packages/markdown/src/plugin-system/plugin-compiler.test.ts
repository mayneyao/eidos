import { HIGHLIGHT, STRIKETHROUGH } from "@lexical/markdown"
import { createEditor, $getRoot } from "lexical"
import { describe, expect, it } from "vitest"

import {
  $convertFromEfmMarkdownString,
  $convertToEfmMarkdownString,
} from "../markdown/efm-document"
import { EIDOS_MARKDOWN_TRANSFORMERS } from "../markdown/markdown-transformers"
import { EfmSourceBlockNode } from "../nodes/efm-source-block-node"
import { MARKDOWN_EDITOR_CORE_NODES } from "../nodes/node-registry"
import { commonmarkPlugin, eidosMarkdownPlugins, gfmPlugin } from "./builtins"
import { defineMarkdownPlugin } from "./plugin-api"
import { compileMarkdownPlugins } from "./plugin-compiler"

describe("compileMarkdownPlugins", () => {
  it("installs standard editing behaviors only with their owning plugins", () => {
    expect(compileMarkdownPlugins([]).behaviors).toEqual([])
    expect(
      compileMarkdownPlugins([commonmarkPlugin]).behaviors.map(
        (item) => item.id
      )
    ).toEqual(["eidos.commonmark.behavior"])
    expect(
      compileMarkdownPlugins([gfmPlugin, commonmarkPlugin]).behaviors.map(
        (item) => item.id
      )
    ).toEqual([
      "eidos.commonmark.behavior",
      "markdown.table.behavior",
      "markdown.task-list.behavior",
    ])
  })
  it("reconstructs the shipped transformer order from the default profile", () => {
    const registry = compileMarkdownPlugins(eidosMarkdownPlugins)
    expect(registry.blockSyntax.map((syntax) => syntax.id)).toEqual([
      "eidos.math.block",
      "markdown.html.block",
    ])
    expect(registry.inlineSyntax.map((syntax) => syntax.id)).toEqual([
      "eidos.math.inline",
    ])
    const native = registry.transformers.slice(
      registry.blockSyntax.length + registry.inlineSyntax.length
    )
    // Tables are freshly bound to each composition; other definitions retain identity.
    expect(native[0]).not.toBe(EIDOS_MARKDOWN_TRANSFORMERS[0])
    expect(native[0].type).toBe("multiline-element")
    expect("dependencies" in native[0] && native[0].dependencies).toEqual(
      "dependencies" in EIDOS_MARKDOWN_TRANSFORMERS[0] &&
        EIDOS_MARKDOWN_TRANSFORMERS[0].dependencies
    )
    expect(native.slice(1)).toEqual(EIDOS_MARKDOWN_TRANSFORMERS.slice(1))
    expect(registry.toolbar.map((item) => item.id)).toEqual([
      "format.bold",
      "format.italic",
      "format.strikethrough",
      "format.highlight",
      "format.inline-code",
    ])
    expect(registry.insertions.map((item) => item.id)).toEqual([
      "eidos.commonmark.heading-1",
      "eidos.commonmark.heading-2",
      "eidos.commonmark.heading-3",
      "eidos.commonmark.quote",
      "eidos.commonmark.bullet-list",
      "eidos.commonmark.number-list",
      "eidos.gfm.check-list",
      "eidos.commonmark.code",
      "eidos.gfm.table",
      "eidos.commonmark.divider",
      "eidos.math.block",
      "eidos.math.inline",
      "image",
      "footnote",
      "html",
      "frontmatter",
    ])
  })

  it("orders dependencies and contributions without mutating input", () => {
    const base = defineMarkdownPlugin({
      apiVersion: 1,
      id: "acme.base",
      version: "1.0.0",
      features: ["acme.base"],
      transformers: [{ order: 20, transformer: STRIKETHROUGH }],
    })
    const extension = defineMarkdownPlugin({
      apiVersion: 1,
      id: "acme.extension",
      version: "1.0.0",
      requires: [base.id],
      features: ["acme.extension"],
      transformers: [{ order: 10, transformer: HIGHLIGHT }],
      insertions: [
        {
          id: "acme.callout",
          contexts: ["block"],
          glyph: "!",
          label: "Callout",
          section: "extended",
          execute: () => undefined,
        },
      ],
    })

    const registry = compileMarkdownPlugins([extension, base])

    expect(registry.plugins.map((plugin) => plugin.id)).toEqual([
      "acme.base",
      "acme.extension",
    ])
    expect(registry.transformers).toEqual([HIGHLIGHT, STRIKETHROUGH])
    expect(registry.features).toEqual(new Set(["acme.base", "acme.extension"]))
    expect(registry.insertions[0]).toMatchObject({
      id: "acme.callout",
      pluginId: "acme.extension",
    })
  })

  it("rejects missing dependencies, cycles, and inert external insertions", () => {
    expect(() =>
      compileMarkdownPlugins([
        defineMarkdownPlugin({
          apiVersion: 1,
          id: "acme.extension",
          version: "1.0.0",
          requires: ["acme.missing"],
        }),
      ])
    ).toThrow(/requires missing plugin/u)

    expect(() =>
      compileMarkdownPlugins([
        defineMarkdownPlugin({
          apiVersion: 1,
          id: "acme.one",
          version: "1.0.0",
          after: ["acme.two"],
        }),
        defineMarkdownPlugin({
          apiVersion: 1,
          id: "acme.two",
          version: "1.0.0",
          after: ["acme.one"],
        }),
      ])
    ).toThrow(/contains a cycle/u)

    expect(() =>
      compileMarkdownPlugins([
        defineMarkdownPlugin({
          apiVersion: 1,
          id: "acme.callout",
          version: "1.0.0",
          insertions: [
            {
              id: "acme.callout",
              contexts: ["block"],
              glyph: "!",
              label: "Callout",
              section: "extended",
            },
          ],
        }),
      ])
    ).toThrow(/needs an execute handler/u)
  })

  it("rejects a plugin shortcut that shadows a default in the same scope", () => {
    expect(() =>
      compileMarkdownPlugins([
        defineMarkdownPlugin({
          apiVersion: 1,
          id: "acme.shortcuts",
          version: "1.0.0",
          shortcuts: {
            "acme.strong": {
              bindings: [{ key: "b", primary: true }],
              description: "Custom strong action",
              scope: "selection",
            },
          },
        }),
      ])
    ).toThrow(/use the same binding and scope/u)
  })

  it.each([
    "$$\nx^2\n$$",
    "---\ntitle: Hidden\n---",
    "![Alt](https://example.com/image.png)",
    "[^note]: Definition",
    "[docs]: https://example.com",
    "<aside>Raw HTML</aside>",
  ])("preserves disabled semantic syntax as a source block: %s", (source) => {
    const registry = compileMarkdownPlugins([commonmarkPlugin])
    const editor = createEditor({
      nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
    })
    editor.update(
      () => {
        $convertFromEfmMarkdownString(source, registry.transformers, {
          syntaxFeatures: registry.features,
        })
        expect($getRoot().getFirstChild()).toBeInstanceOf(EfmSourceBlockNode)
      },
      { discrete: true }
    )

    expect(
      editor
        .getEditorState()
        .read(() => $convertToEfmMarkdownString(registry.transformers))
    ).toBe(source)
  })

  it.each([
    "Before $x^2$ after",
    "Before ![Alt](https://example.com/image.png) after",
    "Before [docs][ref] after\n\n[ref]: https://example.com",
    "Before [^note] after\n\n[^note]: Definition",
  ])(
    "round-trips disabled inline semantics without their nodes: %s",
    (source) => {
      const registry = compileMarkdownPlugins([commonmarkPlugin])
      const editor = createEditor({
        nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
      })

      editor.update(
        () => {
          $convertFromEfmMarkdownString(source, registry.transformers, {
            syntaxFeatures: registry.features,
          })
        },
        { discrete: true }
      )

      expect(
        editor
          .getEditorState()
          .read(() => $convertToEfmMarkdownString(registry.transformers))
      ).toBe(source)
    }
  )
})
