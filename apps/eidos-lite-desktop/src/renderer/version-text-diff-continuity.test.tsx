// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { FileDiffMetadata } from "@pierre/diffs"
import type {
  EidosLiteApi,
  SpaceVersionTextContentDiff,
} from "../shared/contracts"
import type { VersionInspection } from "./version-change-tree"
import { VersionDiffPreview } from "./version-panel"
import {
  computeVersionTextDiff,
  type VersionTextDiffComputationRequest,
} from "./version-text-diff-computation"

const renderer = vi.hoisted(() => ({
  prepare: vi.fn(async (): Promise<void> => undefined),
  frames: vi.fn(),
}))
vi.mock("./pierre-text-diff-surface", () => ({
  preparePierreTextDiff: renderer.prepare,
  default: ({ diff }: { diff: FileDiffMetadata }) => {
    renderer.frames(diff)
    return createElement("pre", {}, diff.additionLines.join(""))
  },
}))
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function content(path: string, text = path): SpaceVersionTextContentDiff {
  return {
    path,
    before: { state: "utf8", content: "old\n", size: 4 },
    after: { state: "utf8", content: text + "\n", size: text.length + 1 },
  }
}
function inspection(path: string, head = "head"): VersionInspection {
  const change = { path, kind: "text_file", change: "modified" }
  return {
    type: "file",
    key: path,
    mode: "changes",
    change,
    file: null,
    commit: null,
    diff: {
      currentHead: head,
      currentBranch: null,
      from: head,
      to: null,
      paths: [change],
      files: [],
    },
  }
}
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  renderer.prepare.mockReset().mockResolvedValue(undefined)
  renderer.frames.mockClear()
  vi.stubGlobal(
    "Worker",
    class {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      postMessage(request: VersionTextDiffComputationRequest) {
        queueMicrotask(() =>
          this.onmessage?.({
            data: { diff: computeVersionTextDiff(request) },
          } as MessageEvent)
        )
      }
      terminate() {}
    }
  )
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
async function show(path: string, head = "head") {
  await act(async () =>
    root.render(
      createElement(VersionDiffPreview, {
        inspection: inspection(path, head),
        theme: "light",
        onClose() {},
      })
    )
  )
}
const title = () =>
  host.querySelector(".version-inspector-breadcrumbs")?.textContent

it("keeps the first editor frame and shows only delayed toolbar progress", async () => {
  vi.useFakeTimers()
  const read = deferred<SpaceVersionTextContentDiff>()
  window.eidosLite = {
    getWorkingTextDiff: () => read.promise,
  } as unknown as EidosLiteApi
  await show("A.md")
  const frame = host.querySelector(".version-text-diff")
  expect(frame).not.toBeNull()
  await act(async () => {
    vi.advanceTimersByTime(199)
  })
  expect(host.textContent).not.toContain("Opening")
  await act(async () => {
    vi.advanceTimersByTime(1)
  })
  expect(host.textContent).toContain("Opening A.md…")
  await act(async () => read.resolve(content("A.md")))
  expect(host.querySelector(".version-text-diff")).toBe(frame)
  expect(host.querySelector("pre")?.textContent).toContain("A.md")
  expect(host.textContent).not.toContain("Opening")
  expect(vi.getTimerCount()).toBe(0)
})

it("retains A through reading and rendering preparation, with truthful identity and paused actions", async () => {
  const read = deferred<SpaceVersionTextContentDiff>(),
    prepare = deferred<void>()
  const save = vi.fn().mockResolvedValue("copy")
  window.eidosLite = {
    getWorkingTextDiff: (_head: string | null, path: string) =>
      path === "A.md" ? Promise.resolve(content(path)) : read.promise,
    saveTextDraftCopy: save,
  } as unknown as EidosLiteApi
  await show("A.md")
  renderer.prepare.mockImplementationOnce(() => prepare.promise)
  const sidebar = document.createElement("button")
  document.body.append(sidebar)
  sidebar.focus()
  try {
    await show("B.md")
    expect(host.querySelector("pre")?.textContent).toContain("A.md")
    expect(title()).toBe("A.md")
    expect(
      [
        ...host.querySelectorAll<HTMLButtonElement>(
          ".version-text-recovery button"
        ),
      ].every((b) => b.disabled)
    ).toBe(true)
    await act(async () => read.resolve(content("B.md")))
    expect(host.querySelector("pre")?.textContent).toContain("A.md")
    expect(title()).toBe("A.md")
    await act(async () => prepare.resolve())
    expect(host.querySelector("pre")?.textContent).toContain("B.md")
    expect(title()).toBe("B.md")
    expect(document.activeElement).toBe(sidebar)
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === "Save after copy")!
        .click()
    )
    expect(save).toHaveBeenCalledWith("B.md", "B.md\n")
  } finally {
    sidebar.remove()
  }
})

it("ignores a superseded read after C is ready", async () => {
  const b = deferred<SpaceVersionTextContentDiff>(),
    c = deferred<SpaceVersionTextContentDiff>()
  window.eidosLite = {
    getWorkingTextDiff: (_head: string | null, path: string) =>
      path === "A.md"
        ? Promise.resolve(content(path))
        : path === "B.md"
          ? b.promise
          : c.promise,
  } as unknown as EidosLiteApi
  await show("A.md")
  await show("B.md")
  await show("C.md")
  await act(async () => c.resolve(content("C.md")))
  await act(async () => b.resolve(content("B.md")))
  expect(title()).toBe("C.md")
  expect(host.querySelector("pre")?.textContent).toContain("C.md")
})

it("ignores a late worker response from the previous selection", async () => {
  const replies: (() => void)[] = []
  vi.stubGlobal(
    "Worker",
    class {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      postMessage(request: VersionTextDiffComputationRequest) {
        replies.push(() =>
          this.onmessage?.({
            data: { diff: computeVersionTextDiff(request) },
          } as MessageEvent)
        )
      }
      terminate() {}
    }
  )
  window.eidosLite = {
    getWorkingTextDiff: (_head: string | null, path: string) =>
      Promise.resolve(content(path)),
  } as unknown as EidosLiteApi
  await show("A.md")
  await act(async () => replies[0]!())
  await show("B.md")
  await show("C.md")
  expect(title()).toBe("A.md")
  await act(async () => replies[2]!())
  await act(async () => replies[1]!())
  expect(title()).toBe("C.md")
  expect(host.querySelector("pre")?.textContent).toContain("C.md")
})

it("shows read failures under the target name and retries without retaining disguised old content", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(content("A.md"))
    .mockRejectedValueOnce(new Error("synthetic read failed"))
    .mockResolvedValue(content("B.md"))
  window.eidosLite = { getWorkingTextDiff: read } as unknown as EidosLiteApi
  await show("A.md")
  await show("B.md")
  expect(title()).toBe("B.md")
  expect(host.querySelector("pre")).toBeNull()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "synthetic read failed"
  )
  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "Retry")!
      .click()
  )
  expect(title()).toBe("B.md")
  expect(host.querySelector("pre")?.textContent).toContain("B.md")
})

it("gives same-path replacement text a new Pierre identity", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(content("A.md", "first"))
    .mockResolvedValue(content("A.md", "second"))
  window.eidosLite = { getWorkingTextDiff: read } as unknown as EidosLiteApi
  await show("A.md")
  const first = (renderer.frames.mock.lastCall?.[0] as FileDiffMetadata)
    .cacheKey
  await show("A.md", "new-head")
  expect(host.querySelector("pre")?.textContent).toContain("second")
  expect(
    (renderer.frames.mock.lastCall?.[0] as FileDiffMetadata).cacheKey
  ).not.toBe(first)
})
