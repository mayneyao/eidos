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
    return <div data-rich-editor="" />
  },
}))

describe("browser record content integration", () => {
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
            contentImageBaseUrl="http://localhost:8420/api/assets/"
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
        "http://localhost:8420/api/assets/photo.png"
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
