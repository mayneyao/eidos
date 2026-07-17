import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  preloadSpaceEidosFileEditor,
  type SpaceEidosFileEditorComponent,
  SpaceEidosFileEditorLoader,
} from "./space-eidos-file-editor-loader"

vi.mock("./space-eidos-file-editor", () => ({
  SpaceEidosFileEditor: ({ filePath }: { filePath: string }) => (
    <div data-testid="preloaded-eidos-file-editor" data-path={filePath} />
  ),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, reject, resolve }
}

describe("SpaceEidosFileEditorLoader", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("shares one preloaded module promise across Eidos File tabs", async () => {
    const first = preloadSpaceEidosFileEditor()
    const second = preloadSpaceEidosFileEditor()

    expect(second).toBe(first)
    const Editor = await first

    await act(async () => {
      root.render(<Editor filePath="projects/tasks.eidos" />)
    })

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="preloaded-eidos-file-editor"]'
      )?.dataset.path
    ).toBe("projects/tasks.eidos")
  })

  it("keeps a stable loading surface until the Eidos File workspace is ready", async () => {
    const module = deferred<SpaceEidosFileEditorComponent>()
    const loadEditor = vi.fn(() => module.promise)

    await act(async () => {
      root.render(
        <SpaceEidosFileEditorLoader
          filePath="projects/tasks.eidos"
          loadEditor={loadEditor}
        />
      )
    })

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Opening Eidos File"
    )
    expect(loadEditor).toHaveBeenCalledTimes(1)

    await act(async () => {
      module.resolve(({ filePath }) => (
        <div data-testid="eidos-file-editor" data-path={filePath} />
      ))
      await module.promise
    })

    expect(
      container.querySelector<HTMLElement>('[data-testid="eidos-file-editor"]')
        ?.dataset.path
    ).toBe("projects/tasks.eidos")
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it("keeps a failed chunk local and retries from the same tab", async () => {
    const firstAttempt = deferred<SpaceEidosFileEditorComponent>()
    const loadEditor = vi
      .fn<() => Promise<SpaceEidosFileEditorComponent>>()
      .mockReturnValueOnce(firstAttempt.promise)
      .mockResolvedValueOnce(({ filePath }) => (
        <div data-testid="eidos-file-editor" data-path={filePath} />
      ))

    await act(async () => {
      root.render(
        <SpaceEidosFileEditorLoader
          filePath="projects/tasks.eidos"
          loadEditor={loadEditor}
        />
      )
    })

    await act(async () => {
      firstAttempt.reject(new Error("Chunk unavailable"))
      await firstAttempt.promise.catch(() => undefined)
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Chunk unavailable"
    )

    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Retry")
    )
    expect(retry).toBeDefined()

    await act(async () => {
      retry?.click()
      await Promise.resolve()
    })

    expect(loadEditor).toHaveBeenCalledTimes(2)
    expect(
      container.querySelector<HTMLElement>('[data-testid="eidos-file-editor"]')
        ?.dataset.path
    ).toBe("projects/tasks.eidos")
  })
})
