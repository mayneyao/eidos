import { revealDocumentTarget } from "./reveal-document-target"

it("reveals and highlights the paragraph containing a hidden block ID", () => {
  const paragraph = document.createElement("p")
  const marker = document.createElement("span")
  marker.dataset.obsidianBlockId = "stable"
  paragraph.append(marker)
  document.body.append(paragraph)
  paragraph.scrollIntoView = vi.fn()
  paragraph.animate = vi.fn()
  try {
    revealDocumentTarget(marker)
    expect(paragraph.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
    })
    expect(paragraph.animate).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(paragraph)
    paragraph.blur()
    expect(paragraph.hasAttribute("tabindex")).toBe(false)
  } finally {
    paragraph.remove()
  }
})
