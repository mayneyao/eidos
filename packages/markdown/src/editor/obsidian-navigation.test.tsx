import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { MarkdownEditor } from "./markdown-editor"
import { createMarkdownPreset, gfmPreset } from "../presets"
import { wikilinkPlugin } from "../features/wikilink/plugin"

const linkedGfm = createMarkdownPreset({
  id: "test.linked-gfm",
  extends: gfmPreset,
  plugins: [wikilinkPlugin],
})
import {
  defineMarkdownProfile,
  eidosMarkdownProfile,
  MARKDOWN_PROFILE_API_VERSION,
} from "../profile-system"

describe("MarkdownEditor Obsidian navigation", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it.each(["legacy-obsidian", "gfm-wikilink"])(
    "%s routes Markdown and wikilink targets through the same host callback",
    async (mode) => {
      const onOpenInternalLink = vi.fn()
      await act(async () => {
        root.render(
          <MarkdownEditor
            documentKey="Inbox/Current.md"
            markdown={
              "[Markdown note](Notes/Next%20note.md#Section) and [[Notes/Wiki#^stable|Wiki note]]."
            }
            {...(mode === "gfm-wikilink"
              ? { preset: linkedGfm }
              : { profile: "obsidian" as const })}
            readOnly
            showToolbar={false}
            onMarkdownChange={vi.fn()}
            onOpenInternalLink={onOpenInternalLink}
          />
        )
        await Promise.resolve()
      })

      const markdownLink = container.querySelector<HTMLAnchorElement>(
        'a[href^="Notes/Next"]'
      )
      expect(markdownLink, container.innerHTML).not.toBeNull()

      act(() => {
        markdownLink!.click()
        container
          .querySelector<HTMLButtonElement>(".eme-obsidian-link")!
          .click()
      })

      expect(onOpenInternalLink).toHaveBeenNthCalledWith(1, {
        documentKey: "Inbox/Current.md",
        target: "Notes/Next%20note.md#Section",
        path: "Notes/Next note.md",
        heading: "Section",
        embed: false,
        syntax: "markdown",
      })
      expect(onOpenInternalLink).toHaveBeenNthCalledWith(2, {
        documentKey: "Inbox/Current.md",
        target: "Notes/Wiki#^stable",
        path: "Notes/Wiki",
        blockId: "stable",
        displayText: "Wiki note",
        embed: false,
        syntax: "wikilink",
      })
    }
  )

  it("renders frontmatter sequences, empty values, URLs, and wikilinks semantically", async () => {
    const onOpenInternalLink = vi.fn()
    await act(async () => {
      root.render(
        <MarkdownEditor
          documentKey="Clippings/In good hands.md"
          markdown={`---
categories:
  - "[[Clippings]]"
  - "[[Posts]]"
url: https://stephango.com/in-good-hands
topics:
---

Body`}
          profile="obsidian"
          readOnly
          showToolbar={false}
          onMarkdownChange={vi.fn()}
          onOpenInternalLink={onOpenInternalLink}
        />
      )
      await Promise.resolve()
    })

    const metadata = container.querySelector(".eme-efm-frontmatter")
    expect(
      metadata?.querySelectorAll(".eme-efm-metadata-sequence > li")
    ).toHaveLength(2)
    expect(metadata?.textContent).not.toContain('["[[Clippings]]"')
    expect(metadata?.textContent).not.toContain("null")
    expect(
      metadata?.querySelector<HTMLAnchorElement>(
        'a[href="https://stephango.com/in-good-hands"]'
      )
    ).not.toBeNull()

    act(() => {
      metadata
        ?.querySelector<HTMLButtonElement>('[data-obsidian-target="Clippings"]')
        ?.click()
    })
    expect(onOpenInternalLink).toHaveBeenCalledWith({
      documentKey: "Clippings/In good hands.md",
      target: "Clippings",
      path: "Clippings",
      embed: false,
      syntax: "wikilink",
    })
  })

  it("starts a fresh editor session when only the document codec changes", async () => {
    const alternateProfile = defineMarkdownProfile({
      apiVersion: MARKDOWN_PROFILE_API_VERSION,
      id: "test.alternate-markdown",
      version: "1.0.0",
      plugins: eidosMarkdownProfile.plugins,
      codec: eidosMarkdownProfile.codec,
    })
    const props = {
      documentKey: "Current.md",
      markdown: "Body",
      onMarkdownChange: vi.fn(),
    }

    await act(async () => {
      root.render(<MarkdownEditor {...props} profile="eidos" />)
      await Promise.resolve()
    })
    const firstEditor = container.querySelector("[data-lexical-editor]")

    await act(async () => {
      root.render(<MarkdownEditor {...props} profile={alternateProfile} />)
      await Promise.resolve()
    })

    expect(container.querySelector("[data-lexical-editor]")).not.toBe(
      firstEditor
    )
    expect(
      container
        .querySelector("[data-markdown-editor]")
        ?.getAttribute("data-markdown-profile")
    ).toBe(alternateProfile.id)
  })
})
