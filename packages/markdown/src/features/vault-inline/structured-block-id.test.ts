import { createEditor, $getRoot, $isElementNode, $isTextNode } from "lexical"
import { eidosPreset, gfmPreset } from "../../presets"
import { compileMarkdownPlugins } from "../../plugin-system/plugin-compiler"
import { MARKDOWN_EDITOR_CORE_NODES } from "../../nodes/node-registry"
import { $structuredBlockId } from "./structured-block-id"
import { preserveMarkdownSourceEdits } from "../../markdown/source-fidelity"
import { resolveEditableSourceRange } from "../../core/source-range"

const fixtures = [
  ["list", "- first\n- second"],
  ["list", "1. first\n2. second"],
  ["list", "- [ ] first\n- [x] second"],
  ["quote", "> first\n> second"],
  ["table", "| A | B |\n| --- | --- |\n| one | two |"],
  ["efm-block", "> [!note]- Title\n> Body"],
] as const

it.each(fixtures)(
  "owns a %s ID without an extra paragraph: %s",
  (type, body) => {
    const registry = compileMarkdownPlugins(eidosPreset.plugins)
    const editor = createEditor({
      nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
      onError: (e) => {
        throw e
      },
    })
    const source = `Before\n\n${body}\n\n^structure\n\nAfter`
    const analysis = eidosPreset.codec.analyze(source, {})
    expect(analysis.segments).toHaveLength(3)
    expect(analysis.segments[1].source).toBe(`${body}\n\n^structure`)
    const range = resolveEditableSourceRange({
      analyze: eidosPreset.codec.analyze,
      inputProfile: "document",
      markdown: source,
      selectedIndices: [1],
      syntaxFeatures: registry.features,
      topLevelCount: 3,
    })
    expect(range.range?.source).toBe(`${body}\n\n^structure`)
    editor.update(
      () => eidosPreset.codec.import(source, registry.transformers, {}),
      { discrete: true }
    )
    const before = editor.getEditorState().read(() => {
      const nodes = $getRoot().getChildren()
      expect(nodes).toHaveLength(3)
      expect(nodes[1].getType()).toBe(type)
      expect($structuredBlockId(nodes[1])).toBe("structure")
      return eidosPreset.codec.export(registry.transformers)
    })
    editor.update(
      () => {
        const last = $getRoot().getLastChildOrThrow()
        const text = $isElementNode(last) ? last.getFirstChild() : null
        if ($isTextNode(text)) text.setTextContent("Changed")
      },
      { discrete: true }
    )
    const after = editor
      .getEditorState()
      .read(() => eidosPreset.codec.export(registry.transformers))
    expect(preserveMarkdownSourceEdits(source, before, after)).toBe(
      source.replace("After", "Changed")
    )
    editor.setEditorState(
      editor.parseEditorState(JSON.stringify(editor.getEditorState().toJSON()))
    )
    editor.update(
      () => {
        const nodes = $getRoot().getChildren()
        nodes[2].insertAfter(nodes[1])
      },
      { discrete: true }
    )
    const moved = editor.getEditorState().read(() => {
      expect($structuredBlockId($getRoot().getLastChildOrThrow())).toBe(
        "structure"
      )
      return eidosPreset.codec.export(registry.transformers)
    })
    expect(moved.endsWith("\n\n^structure")).toBe(true)
    editor.update(
      () => eidosPreset.codec.import(moved, registry.transformers, {}),
      { discrete: true }
    )
    editor
      .getEditorState()
      .read(() =>
        expect($structuredBlockId($getRoot().getLastChildOrThrow())).toBe(
          "structure"
        )
      )
  }
)

it("leaves standalone markers and GFM literal content unchanged", () => {
  expect(eidosPreset.codec.analyze("^orphan", {}).segments).toHaveLength(1)
  expect(eidosPreset.codec.analyze("Text\n\n^id", {}).segments).toHaveLength(2)
  expect(gfmPreset.codec.analyze("- first\n\n^id", {}).segments).toHaveLength(2)
  expect(
    eidosPreset.codec.analyze("```\n^not-an-id\n```", {}).segments
  ).toHaveLength(1)
})
