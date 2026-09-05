import assert from "node:assert/strict"
import { $createTextNode, $getRoot, createEditor } from "lexical"
import { $isCodeNode } from "@lexical/code-core"
import { EfmSourceBlockNode, eidosMarkdownProfile } from "@eidos.space/markdown"
import { compileMarkdownPlugins } from "@eidos.space/markdown/plugin-api"
import { eidosMarkdownPlugins } from "@eidos.space/markdown/plugins"
import { notePlugin, badgePlugin, quoteNotePlugin } from "./out/note-plugin.js"
import {
  minimalPreset,
  createMarkdownPreset,
} from "@eidos.space/markdown/presets"
import {
  headingPlugin,
  tablePlugin,
  emphasisPlugin,
  quotePlugin,
  wikilinkPlugin,
  embedPlugin,
  tagPlugin,
  commentPlugin,
  blockIdPlugin,
  inlineFootnotePlugin,
} from "@eidos.space/markdown/plugins"

// Public package composition must also govern syntax inside containers.
for (const emphasis of [false, true, false]) {
  const preset = createMarkdownPreset({
    id: `consumer.table-${emphasis}`,
    extends: minimalPreset,
    plugins: [tablePlugin, ...(emphasis ? [emphasisPlugin] : [])],
  })
  const tableRegistry = compileMarkdownPlugins(preset.plugins)
  const tableEditor = createEditor({
    nodes: tableRegistry.nodes,
    onError(error) {
      throw error
    },
  })
  tableEditor.update(
    () =>
      preset.codec.import(
        "| Header |\n| --- |\n| **Bold** |",
        tableRegistry.transformers,
        {}
      ),
    { discrete: true }
  )
  tableEditor.getEditorState().read(() => {
    assert.equal($getRoot().getFirstChild().getType(), "table")
    assert.equal(
      $getRoot()
        .getAllTextNodes()
        .some((node) => node.hasFormat("bold")),
      emphasis
    )
  })
}

const quoteNotes = createMarkdownPreset({
  id: "consumer.quote-notes",
  extends: minimalPreset,
  plugins: [quotePlugin, quoteNotePlugin],
})
const quoteRegistry = compileMarkdownPlugins(quoteNotes.plugins)
const quoteEditor = createEditor({
  nodes: quoteRegistry.nodes,
  onError(error) {
    throw error
  },
})
quoteEditor.update(
  () =>
    quoteNotes.codec.import("> NOTE: Hello", quoteRegistry.transformers, {}),
  { discrete: true }
)
quoteEditor.getEditorState().read(() => {
  assert.ok($isCodeNode($getRoot().getFirstChild()))
  assert.equal(
    quoteNotes.codec.export(quoteRegistry.transformers),
    "> NOTE: Hello"
  )
})

for (const plugin of [
  wikilinkPlugin,
  embedPlugin,
  tagPlugin,
  commentPlugin,
  blockIdPlugin,
  inlineFootnotePlugin,
]) {
  const preset = createMarkdownPreset({
    id: `consumer.${plugin.id}`,
    extends: minimalPreset,
    plugins: [plugin],
  })
  assert.equal(preset.plugins.length, 3)
  assert.ok(preset.plugins.includes(plugin))
}

const headingsOnly = createMarkdownPreset({
  id: "consumer.headings",
  extends: minimalPreset,
  plugins: [headingPlugin],
})
const badges = createMarkdownPreset({
  id: "consumer.badges",
  extends: minimalPreset,
  plugins: [badgePlugin],
})
const badgesRegistry = compileMarkdownPlugins(badges.plugins)
const badgeEditor = createEditor({
  nodes: badgesRegistry.nodes,
  onError(error) {
    throw error
  },
})
badgeEditor.update(
  () =>
    badges.codec.import("A ^^badge^^ here", badgesRegistry.transformers, {}),
  { discrete: true }
)
badgeEditor.getEditorState().read(() => {
  assert.ok(
    $getRoot()
      .getAllTextNodes()
      .some((node) => node.getMode() === "token")
  )
  assert.equal(
    badges.codec.export(badgesRegistry.transformers),
    "A ^^badge^^ here"
  )
})
assert.equal(
  headingsOnly.codec.analyze("# Heading\n\n**plain**", {}).segments.length,
  2
)
assert.ok(
  !headingsOnly.plugins.some((plugin) => plugin.id === "markdown.emphasis")
)

const registry = compileMarkdownPlugins([...eidosMarkdownPlugins, notePlugin])
const options = {
  blockSyntax: registry.blockSyntax,
  syntaxFeatures: registry.features,
}
const source = "Before\n\n:::note\nHello\n:::\n\nAfter"
const editor = createEditor({
  nodes: [EfmSourceBlockNode, ...registry.nodes],
  onError(error) {
    throw error
  },
})
assert.deepEqual(
  eidosMarkdownProfile.codec
    .analyze(source, options)
    .segments.map((s) => s.source),
  ["Before", ":::note\nHello\n:::", "After"]
)
editor.update(
  () => {
    eidosMarkdownProfile.codec.import(source, registry.transformers, options)
    const note = $getRoot().getChildAtIndex(1)
    assert.ok($isCodeNode(note))
    note.clear().append($createTextNode("Changed"))
  },
  { discrete: true }
)
assert.equal(
  editor
    .getEditorState()
    .read(() => eidosMarkdownProfile.codec.export(registry.transformers)),
  source.replace("Hello", "Changed")
)
console.log(
  "Packed consumer: public entry points and custom grammar round trip passed."
)
