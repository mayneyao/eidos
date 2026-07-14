import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  preloadSpaceBaseEditor,
  type SpaceBaseEditorComponent,
  SpaceBaseEditorLoader,
} from "./space-base-editor-loader"

vi.mock("./space-base-editor", () => ({
  SpaceBaseEditor: ({ filePath }: { filePath: string }) => (
    <div data-testid="preloaded-base-editor" data-path={filePath} />
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

describe("SpaceBaseEditorLoader", () => {
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

  it("shares one preloaded module promise across Base tabs", async () => {
    const first = preloadSpaceBaseEditor()
    const second = preloadSpaceBaseEditor()

    expect(second).toBe(first)
    const Editor = await first

    await act(async () => {
      root.render(<Editor filePath="projects/tasks.base" />)
    })

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="preloaded-base-editor"]'
      )?.dataset.path
    ).toBe("projects/tasks.base")
  })

  it("keeps a stable loading surface until the Base workspace is ready", async () => {
    const module = deferred<SpaceBaseEditorComponent>()
    const loadEditor = vi.fn(() => module.promise)

    await act(async () => {
      root.render(
        <SpaceBaseEditorLoader
          filePath="projects/tasks.base"
          loadEditor={loadEditor}
        />
      )
    })

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Opening Base"
    )
    expect(loadEditor).toHaveBeenCalledTimes(1)

    await act(async () => {
      module.resolve(({ filePath }) => (
        <div data-testid="base-editor" data-path={filePath} />
      ))
      await module.promise
    })

    expect(
      container.querySelector<HTMLElement>('[data-testid="base-editor"]')
        ?.dataset.path
    ).toBe("projects/tasks.base")
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it("keeps a failed chunk local and retries from the same tab", async () => {
    const firstAttempt = deferred<SpaceBaseEditorComponent>()
    const loadEditor = vi
      .fn<() => Promise<SpaceBaseEditorComponent>>()
      .mockReturnValueOnce(firstAttempt.promise)
      .mockResolvedValueOnce(({ filePath }) => (
        <div data-testid="base-editor" data-path={filePath} />
      ))

    await act(async () => {
      root.render(
        <SpaceBaseEditorLoader
          filePath="projects/tasks.base"
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
      container.querySelector<HTMLElement>('[data-testid="base-editor"]')
        ?.dataset.path
    ).toBe("projects/tasks.base")
  })
})
