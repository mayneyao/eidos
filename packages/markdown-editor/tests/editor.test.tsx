import React, { createRef, useState } from "react"
import { act } from "react"
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_NORMAL,
  KEY_BACKSPACE_COMMAND,
  KEY_TAB_COMMAND,
  PASTE_COMMAND,
  type LexicalEditor,
} from "lexical"
import { vi } from "vitest"

import {
  MarkdownEditor,
  type MarkdownEditorHandle,
  MarkdownViewer,
} from "../src"
import { render, settle } from "./setup"
import { matchWikiLinkTypeahead } from "../src/wiki-link-plugin"

import "../src/styles.css"

function placeCaret(node: Node, offset: number) {
  const selection = window.getSelection()
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.dispatchEvent(new Event("selectionchange"))
}

function selectText(node: Node, start: number, end: number) {
  const selection = window.getSelection()
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.dispatchEvent(new Event("selectionchange"))
}

function pressKey(editor: HTMLElement, key: string) {
  editor.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key })
  )
}

function lastTextNode(element: Element): Text {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  let last: Text | null = null
  while (current) {
    last = current as Text
    current = walker.nextNode()
  }
  if (!last) throw new Error("Expected element to contain a text node")
  return last
}

function lexicalEditorFor(element: HTMLElement): LexicalEditor {
  const editor = (
    element as HTMLElement & { __lexicalEditor?: LexicalEditor | null }
  ).__lexicalEditor
  if (!editor) throw new Error("Expected Lexical editor on content editable")
  return editor
}

describe("MarkdownEditor", () => {
  it("matches unfinished wiki links for Space completion", () => {
    expect(matchWikiLinkTypeahead("See [[proj")).toEqual({
      leadOffset: 4,
      matchingString: "proj",
      replaceableString: "[[proj",
    })
    expect(matchWikiLinkTypeahead("[[Plan|label")).toBeNull()
    expect(matchWikiLinkTypeahead("[[Plan#heading")).toBeNull()
  })

  it("renders an accessible editable document", async () => {
    const container = render(
      <MarkdownEditor
        defaultValue={"# Notes\n\nWrite locally."}
        ariaLabel="Space note"
      />
    )
    await settle()

    const editor = container.querySelector('[role="textbox"]')
    expect(editor).not.toBeNull()
    expect(editor?.getAttribute("aria-label")).toBe("Space note")
    expect(editor?.getAttribute("aria-multiline")).toBe("true")
    expect(editor?.getAttribute("contenteditable")).toBe("true")
    expect(container.querySelector("h1")?.textContent).toBe("Notes")
    expect(container.querySelector("p")?.textContent).toBe("Write locally.")
  })

  it("keeps Lexical composition state intact for IME input", async () => {
    const container = render(<MarkdownEditor defaultValue="输入" />)
    await settle()

    const root = container.querySelector<HTMLElement>('[role="textbox"]')!
    const editor = lexicalEditorFor(root)
    const text = lastTextNode(root)
    act(() => {
      root.focus()
      placeCaret(text, text.data.length)
      root.dispatchEvent(
        new CompositionEvent("compositionstart", {
          bubbles: true,
          cancelable: true,
          data: "法",
        })
      )
    })
    expect(editor.isComposing()).toBe(true)

    act(() => {
      root.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          cancelable: true,
          data: "法",
        })
      )
    })
    expect(editor.isComposing()).toBe(false)
  })

  it("renders a keyboard-focusable read-only viewer", async () => {
    const container = render(
      <MarkdownViewer markdown="A [link](https://eidos.space)." />
    )
    await settle()

    const document = container.querySelector('[role="document"]')
    expect(document).not.toBeNull()
    expect(document?.getAttribute("contenteditable")).toBe("false")
    expect(document?.getAttribute("tabindex")).toBe("0")
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://eidos.space"
    )
  })

  it("renders unsupported syntax as exact, non-editable source", async () => {
    const markdown = "Before\n\n<div>keep me</div>\n"
    const container = render(
      <MarkdownEditor defaultValue={markdown} ariaLabel="Raw note" />
    )
    await settle()

    expect(
      container.querySelector('[data-unsupported-markdown="true"]')
    ).not.toBeNull()
    expect(container.querySelector('[role="textbox"]')).toBeNull()
    const source = container.querySelector('[role="document"]')
    expect(source?.textContent).toBe(markdown)
    expect(source?.getAttribute("aria-label")).toBe("Raw note")
  })

  it("renders GFM tables through the semantic viewer", async () => {
    const container = render(
      <MarkdownViewer
        markdown={"| Name | Done |\n| --- | ---: |\n| Editor | yes |"}
      />
    )
    await settle()

    expect(container.querySelectorAll("table")).toHaveLength(1)
    expect(
      Array.from(container.querySelectorAll("th")).map(
        (cell) => cell.textContent
      )
    ).toEqual(["Name", "Done"])
    expect(container.querySelector("td")?.textContent).toBe("Editor")
  })

  it("delegates Space images and wiki links to host renderers", async () => {
    const renderImage = vi.fn((image: { resolvedSrc: string }) => (
      <span data-rendered-image={image.resolvedSrc} />
    ))
    const onLinkActivate = vi.fn(
      (_link: unknown, event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault()
      }
    )
    const container = render(
      <MarkdownViewer
        markdown={
          "![Diagram](assets/flow.png)\n\n[[Notes/Plan|Plan]]\n\n![[cover.png]]"
        }
        rendering={{
          resolveImageSrc: (src) => `space://asset/${src}`,
          resolveWikiLink: (target) => `space://file/${target}`,
          renderImage,
          onLinkActivate,
        }}
      />
    )
    await settle()

    expect(
      new Set(renderImage.mock.calls.map(([image]) => image.resolvedSrc))
    ).toEqual(
      new Set(["space://asset/assets/flow.png", "space://asset/cover.png"])
    )
    expect(
      container.querySelector(
        '[data-rendered-image="space://asset/assets/flow.png"]'
      )
    ).not.toBeNull()
    expect(
      container.querySelector('[data-rendered-image="space://asset/cover.png"]')
    ).not.toBeNull()
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-eidos-wiki-link="true"]'
    )
    expect(link?.getAttribute("href")).toBe("about:blank")
    expect(link?.textContent).toBe("Plan")

    act(() =>
      link?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    )
    expect(onLinkActivate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "wiki",
        label: "Plan",
        target: "Notes/Plan",
      }),
      expect.anything()
    )
  })

  it("sanitizes unsafe host-resolved wiki navigation", async () => {
    const container = render(
      <MarkdownViewer
        markdown="[[Unsafe]]"
        rendering={{
          resolveWikiLink: () => "javascript:alert(1)",
          onLinkActivate: (_link, event) => event.preventDefault(),
        }}
      />
    )
    await settle()

    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "about:blank"
    )
  })

  it("applies controlled source changes without recreating the editor", async () => {
    function ControlledEditor() {
      const [value, setValue] = useState("# First")
      return (
        <>
          <button onClick={() => setValue("## Second")}>Replace</button>
          <MarkdownEditor value={value} onChange={setValue} />
        </>
      )
    }

    const container = render(<ControlledEditor />)
    await settle()
    expect(container.querySelector("h1")?.textContent).toBe("First")

    act(() =>
      container
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    )
    await settle()
    expect(container.querySelector("h1")).toBeNull()
    expect(container.querySelector("h2")?.textContent).toBe("Second")
  })

  it("exposes source-aware imperative conversion", async () => {
    const ref = createRef<MarkdownEditorHandle>()
    render(<MarkdownEditor ref={ref} defaultValue="__bold__" />)
    await settle()

    expect(ref.current?.getMarkdown()).toEqual({
      markdown: "__bold__",
      canonical: "__bold__",
      sourcePreserved: true,
    })

    act(() => ref.current?.setMarkdown("## Replaced"))
    expect(ref.current?.getMarkdown()).toEqual({
      markdown: "## Replaced",
      canonical: "## Replaced",
      sourcePreserved: true,
    })
  })

  it("persists pasted images through the host adapter and inserts Markdown", async () => {
    const onChange = vi.fn()
    const uploadImages = vi.fn(async () => [
      { src: "../assets/pasted.png", alt: "Pasted diagram" },
    ])
    const container = render(
      <MarkdownEditor
        defaultValue="Paste below"
        onChange={onChange}
        uploadImages={uploadImages}
      />
    )
    await settle()

    const editor = container.querySelector<HTMLElement>('[role="textbox"]')!
    act(() => editor.focus())
    const file = new File([new Uint8Array([1, 2, 3])], "diagram.png", {
      type: "image/png",
    })
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: {
        files: [file],
        types: ["Files"],
      } as unknown as DataTransfer,
    })

    act(() => editor.dispatchEvent(event))
    await settle()
    await settle()

    expect(uploadImages).toHaveBeenCalledWith([file])
    expect(onChange).toHaveBeenLastCalledWith(
      expect.stringContaining("![Pasted diagram](../assets/pasted.png)"),
      expect.objectContaining({ sourcePreserved: false })
    )
  })

  it("selects a top-level block from the reusable drag gutter", async () => {
    const container = render(
      <MarkdownEditor defaultValue={"First block\n\nSecond block"} />
    )
    await settle()

    const first = container.querySelector<HTMLElement>("p")!
    first.getBoundingClientRect = () =>
      ({
        bottom: 30,
        height: 30,
        left: 30,
        right: 330,
        top: 0,
        width: 300,
        x: 30,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect

    act(() =>
      first.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientY: 10 })
      )
    )
    await settle()
    const handle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Select and drag block"]'
    )
    expect(handle).not.toBeNull()

    act(() => handle?.click())
    await settle()
    expect(first.classList.contains("eidos-md-block-selected")).toBe(true)
  })

  it("deletes selected blocks and restores an editable caret", async () => {
    const container = render(
      <MarkdownEditor defaultValue={"First block\n\nSecond block"} />
    )
    await settle()

    const root = container.querySelector<HTMLElement>('[role="textbox"]')!
    const editor = lexicalEditorFor(root)
    const first = container.querySelector<HTMLElement>("p")!
    first.getBoundingClientRect = () =>
      ({
        bottom: 30,
        height: 30,
        left: 30,
        right: 330,
        top: 0,
        width: 300,
        x: 30,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect

    act(() =>
      first.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientY: 10 })
      )
    )
    await settle()
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Select and drag block"]'
        )
        ?.click()
    )
    act(() => pressKey(root, "Backspace"))
    await settle()

    expect(
      Array.from(container.querySelectorAll("p"), (item) => item.textContent)
    ).toEqual(["Second block"])
    editor.getEditorState().read(() => {
      expect($isRangeSelection($getSelection())).toBe(true)
    })
  })

  it("lets the rich-text handler process Backspace at a text caret", async () => {
    const container = render(<MarkdownEditor defaultValue="Draft" />)
    await settle()

    const editor = container.querySelector<HTMLElement>('[role="textbox"]')!
    const lexicalEditor = lexicalEditorFor(editor)
    let reachedRichTextPipeline = false
    const unregister = lexicalEditor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      () => {
        reachedRichTextPipeline = true
        return false
      },
      COMMAND_PRIORITY_NORMAL
    )
    act(() => {
      editor.focus()
      lexicalEditor.update(
        () => {
          const text = $getRoot().getFirstDescendant()
          if (!$isTextNode(text)) throw new Error("Expected text node")
          text.select(text.getTextContentSize(), text.getTextContentSize())
          if (!$isRangeSelection($getSelection())) {
            throw new Error("Expected range selection")
          }
          lexicalEditor.dispatchCommand(
            KEY_BACKSPACE_COMMAND,
            new KeyboardEvent("keydown", {
              bubbles: true,
              cancelable: true,
              key: "Backspace",
            })
          )
        },
        { discrete: true }
      )
    })
    await settle()
    unregister()

    expect(reachedRichTextPipeline).toBe(true)
  })

  it("formats a text selection from the standalone floating toolbar", async () => {
    const ref = createRef<MarkdownEditorHandle>()
    const container = render(
      <MarkdownEditor ref={ref} defaultValue="Format me" />
    )
    await settle()

    const root = container.querySelector<HTMLElement>('[role="textbox"]')!
    const text = lastTextNode(root)
    act(() => {
      root.focus()
      selectText(text, 0, text.data.length)
    })
    await settle()

    const toolbar = container.querySelector('[role="toolbar"]')
    expect(toolbar?.getAttribute("aria-label")).toBe("Text formatting")
    act(() =>
      toolbar?.querySelector<HTMLButtonElement>('[aria-label="Bold"]')?.click()
    )
    await settle()

    expect(ref.current?.getMarkdown().markdown).toContain("**Format me**")
  })

  it("creates a Markdown link from the floating toolbar", async () => {
    const ref = createRef<MarkdownEditorHandle>()
    const container = render(
      <MarkdownEditor ref={ref} defaultValue="Link me" />
    )
    await settle()

    const root = container.querySelector<HTMLElement>('[role="textbox"]')!
    const text = lastTextNode(root)
    act(() => {
      root.focus()
      selectText(text, 0, text.data.length)
    })
    await settle()
    act(() =>
      container.querySelector<HTMLButtonElement>('[aria-label="Link"]')?.click()
    )
    await settle()

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Link URL"]'
    )!
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(input, "https://eidos.space")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() =>
      input
        .closest("form")
        ?.dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true })
        )
    )
    await settle()

    expect(ref.current?.getMarkdown().markdown).toContain(
      "[Link me](https://eidos.space)"
    )
  })

  it("turns newly typed URLs into editable Markdown links", async () => {
    const ref = createRef<MarkdownEditorHandle>()
    const container = render(<MarkdownEditor ref={ref} defaultValue="Visit" />)
    await settle()

    const root = container.querySelector<HTMLElement>('[role="textbox"]')!
    const editor = lexicalEditorFor(root)
    act(() => {
      editor.update(
        () => {
          const text = $getRoot().getFirstDescendant()
          if (!$isTextNode(text)) throw new Error("Expected text node")
          text.setTextContent("Visit https://eidos.space ")
        },
        { discrete: true }
      )
    })
    await settle()

    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://eidos.space"
    )
    const markdown = ref.current?.getMarkdown().markdown ?? ""
    expect(markdown).toContain("https://eidos.space")
    expect(markdown).not.toContain("https\\://")
  })

  it("selects blocks with a blank-area marquee", async () => {
    const container = render(
      <MarkdownEditor defaultValue={"First block\n\nSecond block"} />
    )
    await settle()

    const root = container.querySelector<HTMLElement>('[role="textbox"]')!
    const surface = container.querySelector<HTMLElement>(
      ".eidos-md-editor-surface"
    )!
    const [first, second] = Array.from(
      container.querySelectorAll<HTMLElement>("p")
    )
    surface.getBoundingClientRect = () =>
      ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    first.getBoundingClientRect = () =>
      ({
        bottom: 40,
        height: 30,
        left: 40,
        right: 340,
        top: 10,
        width: 300,
        x: 40,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect
    second.getBoundingClientRect = () =>
      ({
        bottom: 90,
        height: 30,
        left: 40,
        right: 340,
        top: 60,
        width: 300,
        x: 40,
        y: 60,
        toJSON: () => ({}),
      }) as DOMRect

    act(() => {
      root.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 5,
        })
      )
      window.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: 360,
          clientY: 45,
        })
      )
    })
    await settle()

    expect(container.querySelector(".eidos-md-block-marquee")).not.toBeNull()
    expect(first.classList.contains("eidos-md-block-selected")).toBe(true)
    expect(second.classList.contains("eidos-md-block-selected")).toBe(false)

    act(() =>
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    )
    await settle()
    expect(container.querySelector(".eidos-md-block-marquee")).toBeNull()
  })

  it("marquee-selects and deletes individual list items", async () => {
    const container = render(
      <MarkdownEditor defaultValue={"- First\n- Second\n- Third"} />
    )
    await settle()

    const root = container.querySelector<HTMLElement>('[role="textbox"]')!
    const surface = container.querySelector<HTMLElement>(
      ".eidos-md-editor-surface"
    )!
    const items = Array.from(container.querySelectorAll<HTMLElement>("li"))
    surface.getBoundingClientRect = () =>
      ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    items.forEach((item, index) => {
      const top = 10 + index * 40
      item.getBoundingClientRect = () =>
        ({
          bottom: top + 30,
          height: 30,
          left: 40,
          right: 340,
          top,
          width: 300,
          x: 40,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect
    })

    act(() => {
      root.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 45,
        })
      )
      window.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: 360,
          clientY: 85,
        })
      )
    })
    await settle()

    expect(items[0].classList.contains("eidos-md-block-selected")).toBe(false)
    expect(items[1].classList.contains("eidos-md-block-selected")).toBe(true)
    expect(items[2].classList.contains("eidos-md-block-selected")).toBe(false)

    act(() => pressKey(root, "Backspace"))
    await settle()

    expect(
      Array.from(container.querySelectorAll("li"), (item) => item.textContent)
    ).toEqual(["First", "Third"])
    expect(container.querySelectorAll("ul")).toHaveLength(1)
  })

  it("inserts a paragraph when Enter follows a block selection", async () => {
    const container = render(<MarkdownEditor defaultValue="First block" />)
    await settle()

    const editor = container.querySelector<HTMLElement>('[role="textbox"]')!
    const first = container.querySelector<HTMLElement>("p")!
    first.getBoundingClientRect = () =>
      ({
        bottom: 30,
        height: 30,
        left: 30,
        right: 330,
        top: 0,
        width: 300,
        x: 30,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect

    act(() =>
      first.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientY: 10 })
      )
    )
    await settle()
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Select and drag block"]'
        )
        ?.click()
    )
    await settle()
    act(() => pressKey(editor, "Enter"))
    await settle()

    expect(container.querySelectorAll("p")).toHaveLength(2)
    expect(container.querySelectorAll("p")[1]?.textContent).toBe("")
  })

  it("continues and exits a Markdown list with Enter", async () => {
    const container = render(<MarkdownEditor defaultValue="- First" />)
    await settle()

    const editor = container.querySelector<HTMLElement>('[role="textbox"]')!
    const text = lastTextNode(container.querySelector("li")!)
    act(() => {
      editor.focus()
      placeCaret(text, text.data.length)
    })
    await settle()

    act(() => pressKey(editor, "Enter"))
    await settle()
    expect(container.querySelectorAll("li")).toHaveLength(2)

    act(() => pressKey(editor, "Enter"))
    await settle()
    expect(container.querySelectorAll("li")).toHaveLength(1)
    expect(container.querySelectorAll("p")).toHaveLength(1)
  })

  it("indents and outdents list items with Tab", async () => {
    const container = render(
      <MarkdownEditor defaultValue={"- Parent\n- Child"} />
    )
    await settle()

    const editor = container.querySelector<HTMLElement>('[role="textbox"]')!
    const lexicalEditor = lexicalEditorFor(editor)
    act(() => {
      editor.focus()
      lexicalEditor.update(
        () => {
          const child = $getRoot().getAllTextNodes()[1]
          child.select(child.getTextContentSize(), child.getTextContentSize())
          lexicalEditor.dispatchCommand(
            KEY_TAB_COMMAND,
            new KeyboardEvent("keydown", {
              bubbles: true,
              cancelable: true,
              key: "Tab",
            })
          )
        },
        { discrete: true }
      )
    })
    await settle()
    expect(container.querySelectorAll("ul ul")).toHaveLength(1)

    act(() => {
      lexicalEditor.dispatchCommand(
        KEY_TAB_COMMAND,
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Tab",
          shiftKey: true,
        })
      )
    })
    await settle()
    expect(container.querySelectorAll("ul ul")).toHaveLength(0)
    expect(container.querySelectorAll("li")).toHaveLength(2)
  })

  it("restores visible markers for ordered and unordered lists", async () => {
    const container = render(
      <MarkdownEditor defaultValue={"- Bullet\n\n1. Numbered"} />
    )
    await settle()

    expect(getComputedStyle(container.querySelector("ul")!).listStyleType).toBe(
      "disc"
    )
    expect(getComputedStyle(container.querySelector("ol")!).listStyleType).toBe(
      "decimal"
    )
  })

  it("highlights labeled fenced code without changing its Markdown", async () => {
    const ref = createRef<MarkdownEditorHandle>()
    const source = "```js\nconst answer = 42\n```"
    const container = render(<MarkdownEditor ref={ref} defaultValue={source} />)
    await settle()
    await settle()

    const code = container.querySelector<HTMLElement>(".eidos-md-code-block")!
    expect(code.dataset.language).toBe("js")
    expect(code.dataset.gutter).toBe("1")
    expect(code.querySelector(".eidos-md-token-keyword")).not.toBeNull()
    expect(code.querySelector(".eidos-md-token-number")).not.toBeNull()
    expect(ref.current?.getMarkdown()).toMatchObject({
      markdown: source,
      sourcePreserved: true,
    })
  })

  it("does not invent a language for unlabeled fenced code", async () => {
    const ref = createRef<MarkdownEditorHandle>()
    const source = "```\nplain text\n```"
    const container = render(<MarkdownEditor ref={ref} defaultValue={source} />)
    await settle()

    const code = container.querySelector<HTMLElement>(".eidos-md-code-block")!
    expect(code.hasAttribute("data-language")).toBe(false)
    expect(ref.current?.getMarkdown()).toMatchObject({
      markdown: source,
      sourcePreserved: true,
    })
  })

  it("pastes recognizable Markdown as document blocks", async () => {
    const container = render(<MarkdownEditor defaultValue="" />)
    await settle()

    const root = container.querySelector<HTMLElement>('[role="textbox"]')!
    const editor = lexicalEditorFor(root)
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: {
        files: [],
        types: ["text/plain", "text/markdown"],
        getData: (type: string) =>
          type === "text/plain" ? "## Pasted\n\n- One\n- Two" : "",
      } as unknown as DataTransfer,
    })

    act(() => {
      editor.update(
        () => {
          $getRoot().getFirstChild()?.selectStart()
          editor.dispatchCommand(PASTE_COMMAND, event)
        },
        { discrete: true }
      )
    })
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(container.querySelector("h2")?.textContent).toBe("Pasted")
    expect(
      Array.from(container.querySelectorAll("li"), (item) => item.textContent)
    ).toEqual(["One", "Two"])
  })

  it("supports thematic break insertion from editor controls", async () => {
    const container = render(<MarkdownEditor defaultValue="Before" />)
    await settle()

    const root = container.querySelector<HTMLElement>('[role="textbox"]')!
    const editor = lexicalEditorFor(root)
    act(() => {
      editor.update(
        () => {
          $getRoot().getFirstChild()?.selectEnd()
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
        },
        { discrete: true }
      )
    })
    await settle()

    expect(container.querySelector("hr")).not.toBeNull()
  })
})
