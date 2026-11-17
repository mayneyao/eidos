// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { useExplorerClipboard } from "./use-explorer-clipboard"
import type { SpaceTreeEntry } from "../shared/contracts"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
it("finishes a pending Copy after switching to another application", async () => {
  const root = createRoot(document.createElement("div"))
  const entry: SpaceTreeEntry = {
    name: "photo.png",
    relativePath: "photo.png",
    kind: "file",
    size: 1,
    modifiedAtMs: 1,
  }
  let finish!: () => void
  const preparing = new Promise<void>((resolve) => {
    finish = resolve
  })
  const cancel = vi.fn()
  const copy = vi.fn(async () => undefined)
  let clipboard!: ReturnType<typeof useExplorerClipboard>
  function Harness() {
    clipboard = useExplorerClipboard({
      spaceId: "space",
      disabled: false,
      prepare: async () => {
        await preparing
        return { spaceId: "space", sources: [] }
      },
      cancelPrepare: cancel,
      copy,
      move: async () => undefined,
      onError: vi.fn(),
    })
    return null
  }
  try {
    await act(async () => root.render(<Harness />))
    let capture!: Promise<void>
    await act(async () => {
      capture = clipboard.capture("copy", [entry])
    })
    await act(async () => window.dispatchEvent(new Event("blur")))
    expect(cancel).not.toHaveBeenCalled()
    await act(async () => {
      finish()
      await capture
    })
    expect(clipboard.canPaste("destination")).toBe(true)
    await act(async () => clipboard.paste("destination"))
    expect(copy).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
  }
})

it("preserves internal Copy/Cut, gives external updates priority and leaves text Copy untouched", async () => {
  const host = document.createElement("div")
  const root = createRoot(host)
  const entry: SpaceTreeEntry = {
    name: "note.txt",
    relativePath: "folder/note.txt",
    kind: "file",
    size: 1,
    modifiedAtMs: 1,
  }
  const copy = vi.fn(async () => undefined)
  const move = vi.fn<Parameters<typeof useExplorerClipboard>[0]["move"]>(
    async (_paths, _target, complete) => complete([entry.relativePath])
  )
  const error = vi.fn()
  const isCurrent = vi.fn(async () => true)
  const cancel = vi.fn()
  const prepare = vi.fn(async () => ({
    spaceId: "space",
    sources: [{ relativePath: entry.relativePath, token: "source" }],
    systemClipboardToken: "system",
  }))
  let clipboard!: ReturnType<typeof useExplorerClipboard>
  function Harness() {
    clipboard = useExplorerClipboard({
      spaceId: "space",
      disabled: false,
      prepare,
      isCurrent,
      cancelPrepare: cancel,
      copy,
      move,
      onError: error,
    })
    return <input />
  }
  try {
    await act(async () => root.render(<Harness />))
    await act(async () => clipboard.capture("copy", [entry]))
    expect(prepare).toHaveBeenLastCalledWith([entry.relativePath], "copy")
    await act(async () => clipboard.paste(null))
    expect(copy).toHaveBeenCalledOnce()
    isCurrent.mockResolvedValue(false)
    await act(async () => clipboard.paste(null))
    expect(copy).toHaveBeenCalledOnce()
    expect(clipboard.canPaste(null)).toBe(false)
    isCurrent.mockResolvedValue(true)
    await act(async () => clipboard.capture("cut", [entry]))
    await act(async () => clipboard.paste(null))
    expect(move).toHaveBeenCalledOnce()
    expect(clipboard.canPaste(null)).toBe(false)
    await act(async () => clipboard.capture("copy", [entry]))
    isCurrent.mockResolvedValue(false)
    await act(async () => window.dispatchEvent(new Event("focus")))
    expect(clipboard.clipboard).toBeNull()
    isCurrent.mockResolvedValue(true)
    await act(async () => clipboard.capture("copy", [entry]))
    const event = new Event("copy", { bubbles: true, cancelable: true })
    await act(async () => {
      document.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false)
    expect(cancel).toHaveBeenCalledOnce()
    expect(clipboard.clipboard).toBeNull()
    expect(error).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
  }
})
