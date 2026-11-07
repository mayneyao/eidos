// @vitest-environment jsdom
import { act } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui"
import { EidosFileRecordInspector } from "@eidos.space/eidos-file-ui/eidos-file-record-inspector"
import { AutomaticMaterializationFence } from "./automatic-materialization"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value() {},
})
const field: EidosFileFieldInfo = {
  id: "title",
  tableId: "tasks",
  tableName: "tasks",
  name: "Title",
  type: "text",
  tableColumnName: "title",
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  isRecordLabel: true,
  sourceTableColumnName: null,
  dependsOn: null,
}
const cleanups: (() => void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await act(async () => cleanup())
})
function type(input: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )!.set!.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}
function fixture(markdown = false) {
  const host = document.createElement("div")
  host.dataset.eidosFileWorkbench = ""
  document.body.append(host)
  const root = createRoot(host)
  let locked = false
  let key = 0
  let value = "Local saved"
  let retired = false
  const save = vi.fn()
  const fence = new AutomaticMaterializationFence((next) => {
    locked = next
    flushSync(render)
  })
  fence.connect()
  const pending = (id: string, value: boolean) => {
    if (value) fence.pending.add(id)
    else fence.pending.delete(id)
  }
  const render = () =>
    root.render(
      retired ? null : (
        <EidosFileUIProvider
          onPendingEditChange={pending}
          markdownEditingMode="wysiwyg"
        >
          <EidosFileRecordInspector
            key={key}
            row={{ _id: "one", title: value, body: value }}
            fields={
              markdown
                ? [
                    field,
                    {
                      ...field,
                      id: "body",
                      name: "Body",
                      tableColumnName: "body",
                      isRecordLabel: false,
                    },
                  ]
                : [field]
            }
            variant={markdown ? "page" : "panel"}
            contentField={
              markdown
                ? {
                    ...field,
                    id: "body",
                    name: "Body",
                    tableColumnName: "body",
                    isRecordLabel: false,
                  }
                : undefined
            }
            disabled={locked}
            onCellEdit={save}
          />
        </EidosFileUIProvider>
      )
    )
  cleanups.push(() => {
    fence.dispose()
    root.unmount()
    host.remove()
  })
  return {
    host,
    save,
    fence,
    render,
    materialize() {
      key += 1
      value = "Remote materialized"
      render()
    },
    retire() {
      retired = true
      render()
    },
  }
}

it("declines apply for a real unsubmitted shared field, permits a clean long-open view and resumes after discard/unmount", async () => {
  const f = fixture()
  await act(async () => f.render())
  const editor = f.host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Title"]'
  )!
  await act(async () => type(editor, "Unsubmitted"))
  expect(f.fence.pending.size).toBeGreaterThan(0)
  expect(f.fence.prepare("dirty", "s", "s")).toBe(false)
  expect(editor.value).toBe("Unsubmitted")
  expect(f.save).not.toHaveBeenCalled()
  await act(async () => type(editor, "Local saved"))
  expect(f.fence.pending.size).toBe(0)
  await act(async () => expect(f.fence.prepare("clean", "s", "s")).toBe(true))
  expect(editor.isConnected).toBe(false)
  expect(f.host.querySelector('textarea[aria-label="Title"]')).toBeNull()
  await act(async () => f.fence.release("clean"))
  expect(f.host.querySelector('textarea[aria-label="Title"]')).not.toBeNull()
})

it("blocks concurrent typing throughout atomic apply and delayed snapshot/rekey; unlocks with the remote value", async () => {
  const f = fixture()
  await act(async () => f.render())
  const editor = f.host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Title"]'
  )!
  await act(async () => expect(f.fence.prepare("apply", "s", "s")).toBe(true))
  expect(f.host.hasAttribute("inert")).toBe(true)
  expect(editor.isConnected).toBe(false)
  expect(f.host.querySelector('textarea[aria-label="Title"]')).toBeNull()
  await act(async () => type(editor, "Input during atomic apply"))
  expect(f.fence.pending.size).toBe(0)
  expect(f.save).not.toHaveBeenCalled()
  let finishSnapshot!: () => void
  const snapshot = new Promise<void>((resolve) => {
    finishSnapshot = resolve
  })
  f.fence.trackRefresh(
    snapshot.then(() => {
      f.materialize()
    })
  )
  let released = false
  const release = f.fence.release("apply").then(() => {
    released = true
  })
  await act(async () => {
    await Promise.resolve()
  })
  expect(released).toBe(false)
  await act(async () => type(editor, "Input after ready before snapshot"))
  expect(f.fence.pending.size).toBe(0)
  await act(async () => {
    finishSnapshot()
    await release
  })
  const refreshed = f.host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Title"]'
  )!
  expect(refreshed.value).toBe("Remote materialized")
  expect(refreshed.disabled).toBe(false)
  expect(f.host.hasAttribute("inert")).toBe(false)
  await act(async () => type(refreshed, "New edit on remote base"))
  expect(f.fence.pending.size).toBeGreaterThan(0)
})

it("does not let another Space or stale release token open the input fence", async () => {
  const f = fixture()
  await act(async () => f.render())
  expect(f.fence.prepare("old", "new-space", "old-space")).toBe(false)
  await act(async () => expect(f.fence.prepare("current", "s", "s")).toBe(true))
  await f.fence.release("old")
  expect(f.host.hasAttribute("inert")).toBe(true)
  await act(async () => f.fence.release("current"))
  expect(f.host.hasAttribute("inert")).toBe(false)
})

it("protects the real Markdown editor when input returns during apply and restores editing on the remote base", async () => {
  await import("@eidos.space/eidos-file-ui/eidos-file-markdown-source-editor")
  const f = fixture(true)
  await act(async () => f.render())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  const editor = f.host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Markdown content"]'
  )!
  expect(editor).not.toBeNull()
  expect(f.fence.pending.size).toBe(0)
  await act(async () =>
    expect(f.fence.prepare("markdown-apply", "s", "s")).toBe(true)
  )
  expect(editor.isConnected).toBe(false)
  await act(async () => type(editor, "Would overwrite remote markdown"))
  expect(f.fence.pending.size).toBe(0)
  expect(f.save).not.toHaveBeenCalled()
  await act(async () => f.materialize())
  await act(async () => f.fence.release("markdown-apply"))
  const refreshed = f.host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Markdown content"]'
  )!
  expect(refreshed.value).toBe("Remote materialized")
  await act(async () => type(refreshed, "New markdown edit"))
  expect(f.fence.pending.size).toBeGreaterThan(0)
})

it("keeps the input fence when the entire materialized event is missing until its recovery refresh finishes", async () => {
  const f = fixture()
  await act(async () => f.render())
  await act(async () =>
    expect(f.fence.prepare("missing-event", "s", "s")).toBe(true)
  )
  let finish!: () => void
  const read = new Promise<void>((resolve) => {
    finish = resolve
  })
  const recover = vi.fn(async () => {
    await read
    f.materialize()
  })
  const release = f.fence.release("missing-event", recover)
  expect(recover).toHaveBeenCalledOnce()
  expect(f.host.hasAttribute("inert")).toBe(true)
  expect(f.host.querySelector("textarea")).toBeNull()
  await act(async () => {
    finish()
    await release
  })
  expect(
    f.host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Title"]')!
      .value
  ).toBe("Remote materialized")
  expect(f.host.hasAttribute("inert")).toBe(false)
})

it("retires the old clean shared editor if the missing-event recovery cannot read the replaced file", async () => {
  const f = fixture()
  await act(async () => f.render())
  await act(async () =>
    expect(f.fence.prepare("failed-event", "s", "s")).toBe(true)
  )
  await act(async () =>
    f.fence.release("failed-event", async () => {
      try {
        throw new Error("Shell snapshot still unavailable")
      } catch {
        f.retire()
      }
    })
  )
  expect(f.host.querySelector("textarea")).toBeNull()
  expect(f.host.hasAttribute("inert")).toBe(false)
})

it.each([false, true])(
  "protects a real %s editor's IME preedit before a value change and resumes after composition end",
  async (markdown) => {
    if (markdown)
      await import("@eidos.space/eidos-file-ui/eidos-file-markdown-source-editor")
    const f = fixture(markdown)
    await act(async () => f.render())
    if (markdown)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    const editor = f.host.querySelector<HTMLTextAreaElement>(
      markdown
        ? 'textarea[aria-label="Markdown content"]'
        : 'textarea[aria-label="Title"]'
    )!
    await act(async () =>
      editor.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true, data: "" })
      )
    )
    expect(f.fence.pending.size).toBe(0)
    expect(f.fence.prepare("ime-preedit", "s", "s")).toBe(false)
    expect(editor.value).toBe("Local saved")
    expect(f.save).not.toHaveBeenCalled()
    await act(async () =>
      editor.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true, data: "" })
      )
    )
    await act(async () =>
      expect(f.fence.prepare("after-ime", "s", "s")).toBe(true)
    )
    await act(async () => f.fence.release("after-ime"))
  }
)

it("disposes a replaced Workspace's document and portal fence without letting an old async release touch the new Workspace", async () => {
  const f = fixture()
  await act(async () => f.render())
  const portal = document.createElement("div")
  portal.id = "portal"
  document.body.append(portal)
  cleanups.push(() => portal.remove())
  await act(async () =>
    expect(f.fence.prepare("old-workspace", "old", "old")).toBe(true)
  )
  let finish!: () => void
  f.fence.trackRefresh(
    new Promise<void>((resolve) => {
      finish = resolve
    })
  )
  const oldRelease = f.fence.release("old-workspace")
  f.fence.dispose()
  expect(f.host.hasAttribute("inert")).toBe(false)
  expect(portal.hasAttribute("inert")).toBe(false)
  const next = new AutomaticMaterializationFence(() => {})
  next.connect()
  cleanups.push(() => next.dispose())
  expect(next.prepare("new-workspace", "new", "new")).toBe(true)
  finish()
  await oldRelease
  expect(portal.hasAttribute("inert")).toBe(true)
  await next.release("new-workspace")
  expect(portal.hasAttribute("inert")).toBe(false)
  const handled = vi.fn()
  portal.addEventListener("input", handled)
  portal.dispatchEvent(new Event("input", { bubbles: true }))
  expect(handled).toHaveBeenCalledOnce()
})
