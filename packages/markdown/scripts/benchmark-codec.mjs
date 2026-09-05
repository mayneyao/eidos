import assert from "node:assert/strict"
import { cpus, platform, arch } from "node:os"
import { performance } from "node:perf_hooks"
import { createEditor, $getRoot } from "lexical"
import {
  compileMarkdownPlugins,
  EfmSourceBlockNode,
} from "@eidos.space/markdown"
import {
  minimalPreset,
  gfmPreset,
  obsidianPreset,
} from "@eidos.space/markdown/presets"

// Public built artifact, no source aliases. Deliberately excludes DOM/layout.
const counts = process.argv.slice(2).map(Number)
if (!counts.length) counts.push(100, 1000)
assert(
  counts.every(
    (count) => Number.isSafeInteger(count) && count > 0 && count <= 10000
  ),
  "Pass paragraph counts between 1 and 10000"
)
const samples = 5
function measure(operation) {
  const start = performance.now()
  operation()
  return performance.now() - start
}
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
    maxMs: Number(sorted.at(-1).toFixed(2)),
  }
}
const results = []
for (const preset of [minimalPreset, gfmPreset, obsidianPreset]) {
  const registry = compileMarkdownPlugins(preset.plugins)
  for (const paragraphs of counts) {
    const source = Array.from(
      { length: paragraphs },
      (_, index) =>
        `Paragraph ${index + 1}. Portable text remains readable. 中文内容与 English text share the same document.`
    ).join("\n\n")
    const timings = { analyze: [], import: [], export: [] }
    // One warm-up per case; fresh editor for every sample, compilation excluded.
    for (let sample = -1; sample < samples; sample++) {
      const editor = createEditor({
        namespace: "markdown-codec-benchmark",
        nodes: [EfmSourceBlockNode, ...registry.nodes],
        onError: (error) => {
          throw error
        },
      })
      let output
      const analyzeMs = measure(() => preset.codec.analyze(source, {}))
      const importMs = measure(() =>
        editor.update(
          () => {
            preset.codec.import(source, registry.transformers, {})
          },
          { discrete: true }
        )
      )
      const exportMs = measure(() =>
        editor.getEditorState().read(() => {
          output = preset.codec.export(registry.transformers)
        })
      )
      // Correctness assertions are outside the measured operations.
      assert.equal(output.trimEnd(), source, `${preset.id}: source changed`)
      editor.getEditorState().read(() => {
        assert.equal($getRoot().getChildrenSize(), paragraphs)
      })
      if (sample >= 0) {
        timings.analyze.push(analyzeMs)
        timings.import.push(importMs)
        timings.export.push(exportMs)
      }
    }
    results.push({
      preset: preset.id,
      paragraphs,
      bytes: Buffer.byteLength(source),
      ...Object.fromEntries(
        Object.entries(timings).map(([key, values]) => [key, summarize(values)])
      ),
    })
  }
}
console.log(
  JSON.stringify(
    {
      scope:
        "Headless codec, plain bilingual paragraphs; not typing, layout, scrolling, or mixed syntax",
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      samples,
      warmups: 1,
      results,
    },
    null,
    2
  )
)
