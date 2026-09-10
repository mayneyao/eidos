import { describe, expect, it, vi } from "vitest"
import { $getRoot, createEditor, type LexicalNode } from "lexical"
import { calloutPlugin } from "./plugins"
import { calloutInsertions } from "./insertions"
import { parseCallout } from "./callout"
import { eidosPreset } from "../../presets"
import { compileMarkdownPlugins } from "../../plugin-system/plugin-compiler"
import { EfmBlockNode, $isEfmBlockNode } from "../../nodes/efm-semantic-node"
import type { MarkdownPluginInsertionExecutionContext } from "../../plugin-system/plugin-api"

describe("callout insertion", () => {
  it("exports callout insertion metadata", () => {
    expect(calloutPlugin.insertions).toBeDefined()
    expect(calloutPlugin.insertions).toHaveLength(1)
    const [callout] = calloutPlugin.insertions!
    expect(callout.id).toBe("markdown.callout")
    expect(callout.glyph).toBe("[!]")
    expect(callout.labelKey).toBe("callout")
    expect(callout.contexts).toEqual(["block"])
    expect(callout.section).toBe("extended")
    expect(callout.keywords).toContain("note")
    expect(callout.keywords).toContain("callout")
  })

  it("includes callout in the compiled eidosPreset insertions", () => {
    const registry = compileMarkdownPlugins(eidosPreset.plugins)
    const insertionKeys = registry.insertions.map((item) => item.labelKey)
    expect(insertionKeys).toContain("callout")
  })

  it("capitalizes default title in parseCallout when title is omitted", () => {
    expect(parseCallout("> [!note]\n> ")?.calloutTitle).toBe("Note")
    expect(parseCallout("> [!warning]\n> ")?.calloutTitle).toBe("Warning")
    expect(parseCallout("> [!tip] Custom Title\n> ")?.calloutTitle).toBe(
      "Custom Title"
    )
  })

  it("executes insertion by inserting an obsidian-callout block and selecting it", () => {
    const [callout] = calloutInsertions
    const editor = createEditor({ nodes: [EfmBlockNode] })
    let createdKey: string | null = null
    const mockInsertBlock = vi.fn((createNode: () => LexicalNode) => {
      const node = createNode()
      $getRoot().append(node)
      createdKey = node.getKey()
      return createdKey
    })
    const mockCloseMenu = vi.fn()
    const mockSelectBlock = vi.fn()

    const context: Partial<MarkdownPluginInsertionExecutionContext> = {
      editor,
      insertBlock: mockInsertBlock,
      closeMenu: mockCloseMenu,
      selectBlock: mockSelectBlock,
    }

    editor.update(
      () => {
        callout.execute!(context as MarkdownPluginInsertionExecutionContext)
      },
      { discrete: true }
    )

    expect(mockInsertBlock).toHaveBeenCalledOnce()
    expect(createdKey).not.toBeNull()
    editor.getEditorState().read(() => {
      const root = $getRoot()
      const [first] = root.getChildren()
      expect($isEfmBlockNode(first)).toBe(true)
      if ($isEfmBlockNode(first)) {
        const data = first.getData()
        expect(data.kind).toBe("obsidian-callout")
        expect(data.calloutType).toBe("note")
        expect(data.calloutTitle).toBe("Note")
        expect(data.source).toBe("> [!note]\n> ")
      }
    })
    expect(mockCloseMenu).toHaveBeenCalledOnce()
    expect(mockSelectBlock).toHaveBeenCalledWith(createdKey)
  })
})
