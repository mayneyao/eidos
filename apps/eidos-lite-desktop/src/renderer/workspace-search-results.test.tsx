// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { TextSearchHit } from "../shared/text-search"
import { WorkspaceSearchResults } from "./workspace-search-results"

it("groups by full path, preserves collapse during progress, and opens the exact hit", async () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const hit = (relativePath: string, start: number): TextSearchHit => ({
    relativePath,
    start,
    end: start + 4,
    line: start + 1,
    column: 1,
    query: "work",
    snippet: "some work here",
    revision: "1",
  })
  const hits = [
    hit("one/note.md", 0),
    hit("two/note.md", 0),
    hit("one/note.md", 10),
  ]
  const open = vi.fn(async () => undefined)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const render = (items: TextSearchHit[], query = "work") =>
    act(async () =>
      root.render(
        <WorkspaceSearchResults
          hits={items}
          query={query}
          opening={false}
          onOpen={open}
        />
      )
    )
  try {
    await render(hits)
    expect(host.querySelectorAll(".workspace-search-file")).toHaveLength(2)
    expect(
      Array.from(
        host.querySelectorAll(".workspace-search-count"),
        (e) => e.textContent
      )
    ).toEqual(["2", "1"])
    const heading = host.querySelector<HTMLButtonElement>(
      ".workspace-search-file-heading"
    )!
    expect(heading.title).toBe("one/note.md")
    await act(async () => heading.click())
    await render([...hits, hit("one/note.md", 20)])
    expect(heading.getAttribute("aria-expanded")).toBe("false")
    expect(
      host.querySelector<HTMLOListElement>(".workspace-search-file-matches")!
        .hidden
    ).toBe(true)
    await act(async () => heading.click())
    const matches = host.querySelectorAll<HTMLButtonElement>(
      ".workspace-search-match"
    )
    await act(async () => matches[1]!.click())
    expect(open).toHaveBeenCalledWith(hits[2])
    expect(matches[1]!.getAttribute("aria-current")).toBe("true")
    expect(matches[1]!.querySelector("mark")!.textContent).toBe("work")
    await act(async () => heading.click())
    await render(hits, "new query")
    expect(
      host
        .querySelector(".workspace-search-file-heading")!
        .getAttribute("aria-expanded")
    ).toBe("true")
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
