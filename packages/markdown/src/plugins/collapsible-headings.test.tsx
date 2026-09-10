import { act } from "react"
import { createRoot } from "react-dom/client"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  type LexicalEditor,
} from "lexical"
import { $createHeadingNode, HeadingNode } from "@lexical/rich-text"
import { MarkdownEditor } from "../editor/markdown-editor"
import {
  $computeHiddenBlockKeys,
  $dominantFoldLevel,
  $getFoldedHeadingEnclosing,
  $getHeadingSectionChildren,
  $getSectionEndNode,
  CollapsibleHeadingsPlugin,
} from "./collapsible-headings-plugin"
import {
  $convertFromEfmMarkdownString,
  $convertToEfmMarkdownString,
} from "../markdown/efm-document"
import { EIDOS_MARKDOWN_TRANSFORMERS } from "../markdown/markdown-transformers"
import { MARKDOWN_EDITOR_NODES } from "../nodes/node-registry"

describe("Collapsible headings logic ($computeHiddenBlockKeys)", () => {
  it("computes hidden blocks for single and nested headings correctly", () => {
    const editor = createEditor({ nodes: [HeadingNode] })
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        const h1 = $createHeadingNode("h1")
        const p1 = $createParagraphNode()
        const h2 = $createHeadingNode("h2")
        const p2 = $createParagraphNode()
        const h1Second = $createHeadingNode("h1")
        const p3 = $createParagraphNode()

        root.append(h1, p1, h2, p2, h1Second, p3)

        const children = root.getChildren()
        const h1Key = h1.getKey()
        const h2Key = h2.getKey()
        const p1Key = p1.getKey()
        const p2Key = p2.getKey()
        const h1SecondKey = h1Second.getKey()
        const p3Key = p3.getKey()

        // 1. Initially nothing folded
        const initial = $computeHiddenBlockKeys(children, new Set())
        expect(initial.hiddenKeys.size).toBe(0)
        expect(initial.foldableHeadingKeys.has(h1Key)).toBe(true)
        expect(initial.foldableHeadingKeys.has(h2Key)).toBe(true)
        expect(initial.foldableHeadingKeys.has(h1SecondKey)).toBe(true)

        // 2. Fold H2 only
        const foldedH2 = $computeHiddenBlockKeys(children, new Set([h2Key]))
        expect(foldedH2.hiddenKeys.has(p2Key)).toBe(true)
        expect(foldedH2.hiddenKeys.has(p1Key)).toBe(false)
        expect(foldedH2.hiddenKeys.has(h1Key)).toBe(false)
        expect(foldedH2.hiddenKeys.has(h2Key)).toBe(false)
        expect(foldedH2.hiddenKeys.has(h1SecondKey)).toBe(false)
        expect(foldedH2.hiddenKeys.has(p3Key)).toBe(false)

        // 3. Fold H1 only
        const foldedH1 = $computeHiddenBlockKeys(children, new Set([h1Key]))
        expect(foldedH1.hiddenKeys.has(p1Key)).toBe(true)
        expect(foldedH1.hiddenKeys.has(h2Key)).toBe(true)
        expect(foldedH1.hiddenKeys.has(p2Key)).toBe(true)
        expect(foldedH1.hiddenKeys.has(h1SecondKey)).toBe(false)
        expect(foldedH1.hiddenKeys.has(p3Key)).toBe(false)

        // 4. Fold both H1 and H2
        const foldedBoth = $computeHiddenBlockKeys(
          children,
          new Set([h1Key, h2Key])
        )
        expect(foldedBoth.hiddenKeys.has(p1Key)).toBe(true)
        expect(foldedBoth.hiddenKeys.has(h2Key)).toBe(true)
        expect(foldedBoth.hiddenKeys.has(p2Key)).toBe(true)
        expect(foldedBoth.hiddenKeys.has(h1SecondKey)).toBe(false)

        // 5. Unfold H1, keeping H2 folded
        const restoredH2 = $computeHiddenBlockKeys(children, new Set([h2Key]))
        expect(restoredH2.hiddenKeys.has(h2Key)).toBe(false)
        expect(restoredH2.hiddenKeys.has(p2Key)).toBe(true)
      },
      { discrete: true }
    )
  })

  it("identifies non-foldable headings (no content or followed by same/higher level heading)", () => {
    const editor = createEditor({ nodes: [HeadingNode] })
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        const h1First = $createHeadingNode("h1")
        const h1Second = $createHeadingNode("h1")
        root.append(h1First, h1Second)

        const children = root.getChildren()
        const result = $computeHiddenBlockKeys(children, new Set())
        expect(result.foldableHeadingKeys.has(h1First.getKey())).toBe(false)
        expect(result.foldableHeadingKeys.has(h1Second.getKey())).toBe(false)
      },
      { discrete: true }
    )
  })
})

describe("Dominant fold level", () => {
  function dominant(levels: number[]): number | null {
    const editor = createEditor({ nodes: [HeadingNode] })
    let result: number | null = null
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        const headings = levels.map((level) =>
          $createHeadingNode(`h${level}` as "h1")
        )
        root.append(...headings)
        result = $dominantFoldLevel(headings)
      },
      { discrete: true }
    )
    return result
  }

  it("prefers the shallowest repeated level", () => {
    expect(dominant([])).toBeNull()
    expect(dominant([1])).toBe(1)
    expect(dominant([1, 1, 2])).toBe(1)
    expect(dominant([1, 2, 2])).toBe(2)
    expect(dominant([2, 2, 2])).toBe(2)
  })

  it("skips a lone shallowest heading and uses the next level", () => {
    expect(dominant([1, 2])).toBe(2)
    expect(dominant([1, 2, 3])).toBe(2)
    expect(dominant([1, 3])).toBe(3)
  })
})

describe("Folded section reordering helpers", () => {
  it("computes section children and end nodes correctly for nested headings", () => {
    const editor = createEditor({ nodes: [HeadingNode] })
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        const h1A = $createHeadingNode("h1")
        const p1 = $createParagraphNode()
        const h2 = $createHeadingNode("h2")
        const p2 = $createParagraphNode()
        const h1B = $createHeadingNode("h1")
        const p3 = $createParagraphNode()

        root.append(h1A, p1, h2, p2, h1B, p3)

        // h1A section children include p1, h2, p2 (stops at h1B)
        const h1AChildren = $getHeadingSectionChildren(h1A)
        expect(h1AChildren.map((n) => n.getKey())).toEqual([
          p1.getKey(),
          h2.getKey(),
          p2.getKey(),
        ])

        // h2 section children only include p2
        const h2Children = $getHeadingSectionChildren(h2)
        expect(h2Children.map((n) => n.getKey())).toEqual([p2.getKey()])

        // When h1A is folded, its end node is p2
        const isFoldedH1A = (k: string) => k === h1A.getKey()
        expect($getSectionEndNode(h1A, isFoldedH1A).getKey()).toBe(p2.getKey())

        // When h1A is not folded, its end node is itself
        expect($getSectionEndNode(h1A, () => false).getKey()).toBe(h1A.getKey())

        // p2 is enclosed by folded h1A
        expect($getFoldedHeadingEnclosing(p2, isFoldedH1A)?.getKey()).toBe(
          h1A.getKey()
        )
        // p3 is NOT enclosed by folded h1A
        expect($getFoldedHeadingEnclosing(p3, isFoldedH1A)).toBeNull()
      },
      { discrete: true }
    )
  })
})

describe("Collapsible headings in MarkdownEditor", () => {
  const MARKDOWN_DOC = [
    "# Section One",
    "",
    "Content inside section one.",
    "",
    "## Section Two",
    "",
    "Content inside section two.",
    "",
    "# Section Three",
    "",
    "Content inside section three.",
  ].join("\n")

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  it("folds and unfolds headings via keyboard shortcuts (Cmd+Option+[ and Cmd+Option+T)", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const reactRoot = createRoot(container)

    let currentMarkdown = MARKDOWN_DOC
    await act(async () => {
      reactRoot.render(
        <MarkdownEditor
          documentKey="test-folding"
          markdown={MARKDOWN_DOC}
          onMarkdownChange={(md) => {
            currentMarkdown = md
          }}
        />
      )
    })

    const editorEl = container.querySelector(
      ".eme-content-editable"
    ) as HTMLElement
    expect(editorEl).not.toBeNull()

    const headings = container.querySelectorAll(".eme-heading")
    expect(headings.length).toBe(3)

    // Focus the first heading
    await act(async () => {
      const firstHeading = headings[0] as HTMLElement
      const range = document.createRange()
      range.selectNodeContents(firstHeading)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)

      // Dispatch Cmd+Option+[ (or Ctrl+Alt+[)
      editorEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "[",
          altKey: true,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await new Promise((r) => setTimeout(r, 10))
    })

    // First heading is folded
    expect(headings[0].classList.contains("eme-heading-folded")).toBe(true)
    expect(headings[0].getAttribute("aria-expanded")).toBe("false")

    // The paragraphs and sub-heading under Section One are hidden with eme-block-folded
    const foldedBlocks = container.querySelectorAll(".eme-block-folded")
    expect(foldedBlocks.length).toBeGreaterThanOrEqual(3)

    // Section Three is NOT folded
    expect(headings[2].classList.contains("eme-block-folded")).toBe(false)
    expect(headings[2].classList.contains("eme-heading-folded")).toBe(false)

    // Press Cmd+Option+T to toggle unfold
    await act(async () => {
      editorEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "t",
          altKey: true,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await new Promise((r) => setTimeout(r, 10))
    })

    // First heading is unfolded again
    expect(headings[0].classList.contains("eme-heading-folded")).toBe(false)
    expect(headings[0].getAttribute("aria-expanded")).toBe("true")
    expect(container.querySelectorAll(".eme-block-folded").length).toBe(0)

    // Exported / changed markdown remains identical standard CommonMark!
    expect(currentMarkdown).toBe(MARKDOWN_DOC)

    reactRoot.unmount()
    container.remove()
  })

  it("supports fold-all (Cmd+Option+0) and unfold-all (Cmd+Option+Shift+0)", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const reactRoot = createRoot(container)

    await act(async () => {
      reactRoot.render(
        <MarkdownEditor
          documentKey="test-fold-all"
          markdown={MARKDOWN_DOC}
          onMarkdownChange={() => {}}
        />
      )
    })

    const editorEl = container.querySelector(
      ".eme-content-editable"
    ) as HTMLElement

    // Dispatch Cmd+Option+0 (fold all)
    await act(async () => {
      editorEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "0",
          altKey: true,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await new Promise((r) => setTimeout(r, 10))
    })

    const foldedHeadings = container.querySelectorAll(".eme-heading-folded")
    expect(foldedHeadings.length).toBeGreaterThanOrEqual(2)

    // Dispatch Cmd+Option+Shift+0 (unfold all)
    await act(async () => {
      editorEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "0",
          altKey: true,
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(container.querySelectorAll(".eme-heading-folded").length).toBe(0)
    expect(container.querySelectorAll(".eme-block-folded").length).toBe(0)

    reactRoot.unmount()
    container.remove()
  })

  it("fold-all collapses the dominant level instead of a lone title", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const reactRoot = createRoot(container)
    const markdown = [
      "# Guide",
      "",
      "Intro paragraph.",
      "",
      "## First",
      "",
      "First body.",
      "",
      "## Second",
      "",
      "Second body.",
    ].join("\n")

    await act(async () => {
      reactRoot.render(
        <MarkdownEditor
          documentKey="test-fold-dominant"
          markdown={markdown}
          onMarkdownChange={() => {}}
        />
      )
    })

    const editorEl = container.querySelector(
      ".eme-content-editable"
    ) as HTMLElement

    await act(async () => {
      editorEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "0",
          altKey: true,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await new Promise((r) => setTimeout(r, 10))
    })

    const headings = container.querySelectorAll(".eme-heading")
    expect(headings.length).toBe(3)
    expect(headings[0].classList.contains("eme-heading-folded")).toBe(false)
    expect(headings[1].classList.contains("eme-heading-folded")).toBe(true)
    expect(headings[2].classList.contains("eme-heading-folded")).toBe(true)

    reactRoot.unmount()
    container.remove()
  })

  it("folds enclosing heading when caret is inside paragraph", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const reactRoot = createRoot(container)

    await act(async () => {
      reactRoot.render(
        <MarkdownEditor
          documentKey="test-caret-fold"
          markdown={MARKDOWN_DOC}
          onMarkdownChange={() => {}}
        />
      )
    })

    const editorEl = container.querySelector(
      ".eme-content-editable"
    ) as HTMLElement
    const paragraphs = container.querySelectorAll(".eme-paragraph")
    expect(paragraphs.length).toBeGreaterThanOrEqual(2)

    // Place caret in the first paragraph under Section One
    await act(async () => {
      const p1 = paragraphs[0] as HTMLElement
      const range = document.createRange()
      range.selectNodeContents(p1)
      range.collapse(true)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)

      // Toggle fold
      editorEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "[",
          altKey: true,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await new Promise((r) => setTimeout(r, 10))
    })

    const headings = container.querySelectorAll(".eme-heading")
    // Section One was folded!
    expect(headings[0].classList.contains("eme-heading-folded")).toBe(true)

    reactRoot.unmount()
    container.remove()
  })

  it("moves folded heading together with its child content using keyboard move-down and move-up", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const reactRoot = createRoot(container)

    let currentMarkdown = MARKDOWN_DOC
    await act(async () => {
      reactRoot.render(
        <MarkdownEditor
          documentKey="test-move-folded"
          markdown={MARKDOWN_DOC}
          onMarkdownChange={(md) => {
            currentMarkdown = md
          }}
        />
      )
    })

    const editorEl = container.querySelector(
      ".eme-content-editable"
    ) as HTMLElement

    // 1. Focus Section One
    const headings = container.querySelectorAll(".eme-heading")
    expect(headings.length).toBe(3)
    await act(async () => {
      const firstHeading = headings[0] as HTMLElement
      const range = document.createRange()
      range.selectNodeContents(firstHeading)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)

      // Fold Section One
      editorEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "[",
          altKey: true,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(headings[0].classList.contains("eme-heading-folded")).toBe(true)

    // 2. Find the drag handle (placed beside the focused block)
    const dragHandle = container.querySelector<HTMLButtonElement>(
      ".eme-block-drag-handle"
    )
    expect(dragHandle).not.toBeNull()

    // 3. Press Alt+ArrowDown on the drag handle to move Section One down
    await act(async () => {
      dragHandle!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          altKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await new Promise((r) => setTimeout(r, 20))
    })

    // Verify markdown order: Section Three should now be BEFORE Section One!
    // And Section One's children (Content inside section one + Section Two + content) moved with it!
    expect(currentMarkdown.indexOf("# Section Three")).toBeLessThan(
      currentMarkdown.indexOf("# Section One")
    )
    expect(currentMarkdown.indexOf("# Section One")).toBeLessThan(
      currentMarkdown.indexOf("Content inside section one.")
    )
    expect(currentMarkdown.indexOf("Content inside section one.")).toBeLessThan(
      currentMarkdown.indexOf("## Section Two")
    )
    expect(currentMarkdown.indexOf("## Section Two")).toBeLessThan(
      currentMarkdown.indexOf("Content inside section two.")
    )

    // 4. Press Alt+ArrowUp on the drag handle to move Section One back up
    await act(async () => {
      dragHandle!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          altKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await new Promise((r) => setTimeout(r, 20))
    })

    // Now Section One is back at the top!
    expect(currentMarkdown.indexOf("# Section One")).toBeLessThan(
      currentMarkdown.indexOf("# Section Three")
    )
    expect(currentMarkdown.indexOf("# Section One")).toBeLessThan(
      currentMarkdown.indexOf("Content inside section one.")
    )

    reactRoot.unmount()
    container.remove()
  })

  it("moves only the heading itself when the heading is not folded", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const reactRoot = createRoot(container)

    let currentMarkdown = MARKDOWN_DOC
    await act(async () => {
      reactRoot.render(
        <MarkdownEditor
          documentKey="test-move-unfolded"
          markdown={MARKDOWN_DOC}
          onMarkdownChange={(md) => {
            currentMarkdown = md
          }}
        />
      )
    })

    // Focus Section One without folding it
    const headings = container.querySelectorAll(".eme-heading")
    await act(async () => {
      const firstHeading = headings[0] as HTMLElement
      const range = document.createRange()
      range.selectNodeContents(firstHeading)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      await new Promise((r) => setTimeout(r, 10))
    })

    const dragHandle = container.querySelector<HTMLButtonElement>(
      ".eme-block-drag-handle"
    )
    expect(dragHandle).not.toBeNull()

    // Move Section One down via Alt+ArrowDown
    await act(async () => {
      dragHandle!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          altKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await new Promise((r) => setTimeout(r, 20))
    })

    // When unfolded, Section One only moved past its immediate sibling ("Content inside section one.")
    // It did NOT move past Section Three!
    expect(currentMarkdown.indexOf("Content inside section one.")).toBeLessThan(
      currentMarkdown.indexOf("# Section One")
    )
    expect(currentMarkdown.indexOf("# Section One")).toBeLessThan(
      currentMarkdown.indexOf("## Section Two")
    )

    reactRoot.unmount()
    container.remove()
  })

  it("does not alter CommonMark roundtrip or export serialization", () => {
    const editor = createEditor({ nodes: [...MARKDOWN_EDITOR_NODES] })
    editor.update(
      () => {
        $convertFromEfmMarkdownString(MARKDOWN_DOC, EIDOS_MARKDOWN_TRANSFORMERS)
      },
      { discrete: true }
    )

    const serialized = editor
      .getEditorState()
      .read(() => $convertToEfmMarkdownString(EIDOS_MARKDOWN_TRANSFORMERS))

    expect(serialized).toBe(MARKDOWN_DOC)
  })
})
