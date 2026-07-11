import React, { createRef, useState } from "react"
import { act } from "react"
import { vi } from "vitest"

import {
  MarkdownEditor,
  type MarkdownEditorHandle,
  MarkdownViewer,
} from "../src"
import { render, settle } from "./setup"

describe("MarkdownEditor", () => {
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
})
