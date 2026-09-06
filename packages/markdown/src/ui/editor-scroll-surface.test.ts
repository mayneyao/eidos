import { editorScrollSurface } from "./editor-scroll-surface"

it.each(["document", "embedded"])(
  "selects the scroll owner for %s layout",
  (layout) => {
    const host = document.createElement("div")
    host.setAttribute("data-markdown-selection-canvas", "")
    const editor = document.createElement("div")
    editor.dataset.layout = layout
    const stage = document.createElement("div")
    stage.className = "eme-editor-stage"
    const root = document.createElement("div")
    host.append(editor)
    editor.append(stage)
    stage.append(root)
    expect(editorScrollSurface(root)).toBe(layout === "embedded" ? host : stage)
    host.removeAttribute("data-markdown-selection-canvas")
    expect(editorScrollSurface(root)).toBe(stage)
  }
)
