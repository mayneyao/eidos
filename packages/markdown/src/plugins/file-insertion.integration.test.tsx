import { act } from "react"
import { createRoot } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getRoot, KEY_DOWN_COMMAND, type LexicalEditor } from "lexical"
import { MarkdownEditor } from "../editor/markdown-editor"
import { eidosMarkdownProfile } from "../profile-system/builtins"
import { defineMarkdownPlugin } from "../plugin-system/plugin-api"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = () => {}
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
})

it.each([
  "success",
  "cancel",
  "failure",
  "stale",
  "readonly",
  "invalid",
] as const)("desktop slash attachment: %s", async (mode) => {
  let editor: LexicalEditor | undefined
  function Capture() {
    ;[editor] = useLexicalComposerContext()
    return null
  }
  const capture = defineMarkdownPlugin({
    apiVersion: 1,
    id: "test.capture",
    version: "1",
    behaviors: [{ id: "test.capture", component: Capture }],
  })
  const profile = {
    ...eidosMarkdownProfile,
    plugins: [...eidosMarkdownProfile.plugins, capture],
  }
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const changed = vi.fn(),
    onError = vi.fn()
  let finish!: (
    files: { markdownUrl: string; name: string; mediaType: string }[]
  ) => void
  let signal: AbortSignal | undefined
  const onImportFiles = vi.fn(
    (request: { kind: "file" | "image"; signal: AbortSignal }) => {
      signal = request.signal
      if (mode === "failure")
        return Promise.reject(new Error("Permission denied"))
      return new Promise<
        { markdownUrl: string; name: string; mediaType: string }[]
      >((resolve) => {
        finish = resolve
      })
    }
  )
  const render = (readOnly = false, documentKey = "one") => (
    <MarkdownEditor
      documentKey={documentKey}
      markdown=""
      readOnly={readOnly}
      profile={profile}
      onMarkdownChange={changed}
      onImportFiles={onImportFiles}
      onError={onError}
    />
  )
  try {
    await act(async () => root.render(render()))
    await act(async () =>
      editor!.update(() => $getRoot().selectStart(), { discrete: true })
    )
    await act(async () => {
      editor!.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: "/", cancelable: true })
      )
    })
    const option = host.querySelector<HTMLButtonElement>(
      '[id$="-option-attach-file"]'
    )
    expect(option).not.toBeNull()
    await act(async () => option!.click())
    expect(onImportFiles).toHaveBeenCalledOnce()
    expect(onImportFiles.mock.calls[0][0].kind).toBe("file")
    if (mode === "failure") {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Permission denied" })
      )
    } else {
      if (mode === "stale")
        await act(async () => root.render(render(false, "two")))
      if (mode === "readonly") await act(async () => root.render(render(true)))
      await act(async () =>
        finish(
          mode === "cancel"
            ? []
            : [
                {
                  markdownUrl:
                    mode === "invalid"
                      ? "file:///tmp/private.pdf"
                      : "assets/%E4%B8%AD%E6%96%87%20%5B1%5D%20%282%29.pdf",
                  name: "中文 [1] (2).pdf",
                  mediaType: "application/octet-stream",
                },
              ]
        )
      )
      if (mode === "success") {
        await vi.waitFor(() => expect(changed).toHaveBeenCalled())
        expect(changed.mock.lastCall![0]).toContain(
          "assets/%E4%B8%AD%E6%96%87%20%5B1%5D%20%282%29.pdf"
        )
        expect(host.querySelector("a")?.textContent).toBe("中文 [1] (2).pdf")
      } else {
        expect(changed).not.toHaveBeenCalled()
        if (mode === "stale" || mode === "readonly")
          expect(signal?.aborted).toBe(true)
        expect(onError).toHaveBeenCalledTimes(mode === "invalid" ? 1 : 0)
      }
    }
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
