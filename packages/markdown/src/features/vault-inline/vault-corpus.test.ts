import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from "lexical"
import { eidosPreset } from "../../presets"
import { compileMarkdownPlugins } from "../../plugin-system/plugin-compiler"
import { MARKDOWN_EDITOR_CORE_NODES } from "../../nodes/node-registry"
import { preserveMarkdownSourceEdits } from "../../markdown/source-fidelity"

// Optional local corpus: read Markdown only; never write into the user's Vault.
const directory = process.env.EIDOS_MARKDOWN_VAULT_FIXTURES
const files = directory
  ? readdirSync(directory).filter((name) => name.endsWith(".md"))
  : []
describe.skipIf(!directory)("real Vault source fidelity", () => {
  it.each(files)("keeps existing source when appending to %s", (name) => {
    const source = readFileSync(join(directory!, name), "utf8")
      .replace(/^\uFEFF/u, "")
      .replace(/\r\n?/gu, "\n")
    const registry = compileMarkdownPlugins(eidosPreset.plugins)
    const editor = createEditor({
      nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
      onError: (e) => {
        throw e
      },
    })
    editor.update(
      () => eidosPreset.codec.import(source, registry.transformers, {}),
      { discrete: true }
    )
    const before = editor
      .getEditorState()
      .read(() => eidosPreset.codec.export(registry.transformers))
    expect(preserveMarkdownSourceEdits(source, before, before)).toBe(source)
    editor.update(
      () =>
        $getRoot().append(
          $createParagraphNode().append(
            $createTextNode("Corpus regression addition.")
          )
        ),
      { discrete: true }
    )
    const after = editor
      .getEditorState()
      .read(() => eidosPreset.codec.export(registry.transformers))
    const saved = preserveMarkdownSourceEdits(source, before, after)
    expect(saved.startsWith(source.trimEnd())).toBe(true)
    expect(saved.trimEnd().endsWith("Corpus regression addition.")).toBe(true)
  })
})
