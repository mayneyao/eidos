// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import {
  EidosFileUIProvider,
  useEidosFileUI,
} from "@eidos.space/eidos-file-ui/context"
import type { MarkdownEditorProps } from "@eidos.space/markdown"
import { RecordContentProvider } from "./record-content"

const editor = vi.hoisted(() => ({ props: null as MarkdownEditorProps | null }))
vi.mock("@eidos.space/markdown", () => ({
  MarkdownEditor: (props: MarkdownEditorProps) => {
    editor.props = props
    return <div data-rich-editor="" contentEditable tabIndex={0} />
  },
}))

describe("browser record content integration", () => {
  it("focuses the existing editor on each explicit title navigation request", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    function Probe({ token }: { token: number }) {
      return useEidosFileUI().renderMarkdownEditor?.({
        cacheKey: "record:body",
        content: "Draft",
        disabled: false,
        onChange: vi.fn(),
        focusRequestToken: token,
      })
    }
    try {
      const render = async (token: number) => {
        await act(async () =>
          root.render(
            <RecordContentProvider>
              <Probe token={token} />
            </RecordContentProvider>
          )
        )
      }
      await render(0)
      const editorElement =
        host.querySelector<HTMLElement>("[data-rich-editor]")!
      expect(document.activeElement).not.toBe(editorElement)
      await render(1)
      expect(document.activeElement).toBe(editorElement)
      editorElement.blur()
      await render(2)
      expect(document.activeElement).toBe(editorElement)
      expect(host.querySelector("[data-rich-editor]")).toBe(editorElement)
    } finally {
      await act(async () => root.unmount())
      host.remove()
      vi.unstubAllGlobals()
    }
  })
  it("shares rich editing, fragment semantics, theme and mounted image resolution", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    const host = document.createElement("div")
    const root = createRoot(host)
    const onChange = vi.fn()
    let context: ReturnType<typeof useEidosFileUI> | undefined
    function Probe() {
      context = useEidosFileUI()
      return context.renderMarkdownEditor?.({
        cacheKey: "record:body",
        content: "# Text",
        disabled: false,
        onChange,
      })
    }
    try {
      await act(async () =>
        root.render(
          <EidosFileUIProvider
            themeName="dark"
            contentImageBaseUrl="/api/assets/"
          >
            <RecordContentProvider>
              <Probe />
            </RecordContentProvider>
          </EidosFileUIProvider>
        )
      )
      expect(context?.markdownEditingMode).toBe("wysiwyg")
      expect(host.querySelector("[data-rich-editor]")).not.toBeNull()
      expect(editor.props).toMatchObject({
        documentKey: "record:body",
        markdown: "# Text",
        readOnly: false,
        theme: "dark",
        layout: "embedded",
        inputProfile: "fragment",
      })
      editor.props?.onMarkdownChange("edited")
      expect(onChange).toHaveBeenCalledWith("edited")
      expect(await context?.resolveMarkdownImageUrl?.("./photo.png")).toBe(
        new URL("/api/assets/photo.png", window.location.href).href
      )
      expect(
        await context?.resolveMarkdownImageUrl?.("javascript:alert(1)")
      ).toBeNull()
      expect(context?.renderMarkdownHtml?.("==highlight==", {}).html).toContain(
        "<mark>"
      )
    } finally {
      await act(async () => root.unmount())
      vi.unstubAllGlobals()
    }
  })
})
