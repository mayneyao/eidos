// @vitest-environment jsdom
import { spaceFileDocumentDrop } from "./space-file-document-drop"
import {
  EIDOS_LITE_SPACE_ID_DRAG_TYPE,
  EIDOS_LITE_SPACE_PATH_DRAG_TYPE,
  EIDOS_LITE_SPACE_PATHS_DRAG_TYPE,
} from "./space-path-drag"

function transfer(paths: string[], spaceId = "Space-A") {
  const data = new Map([
    [EIDOS_LITE_SPACE_ID_DRAG_TYPE, spaceId],
    [EIDOS_LITE_SPACE_PATH_DRAG_TYPE, paths[0] ?? ""],
    [EIDOS_LITE_SPACE_PATHS_DRAG_TYPE, JSON.stringify(paths)],
  ])
  return {
    types: [...data.keys()],
    getData: (type: string) => data.get(type) ?? "",
  } as unknown as DataTransfer
}
it("resolves a mixed batch in payload order against exactly the originating Space without importing files", async () => {
  const files = [
    {
      name: "中文 [图] (#%).png",
      relativePath: "other/中文 [图] (#%).png",
      kind: "file",
      score: 1,
    },
    {
      name: "report.pdf",
      relativePath: "docs/report.pdf",
      kind: "file",
      score: 1,
    },
  ]
  const search = vi.fn(async () => [
    { ...files[0], relativePath: "wrong/中文 [图] (#%).png" },
    ...files,
  ])
  Object.assign(window, {
    eidosLite: {
      getSpace: vi.fn(async () => ({ id: "Space-A" })),
      searchSpacePaths: search,
    },
  })
  const payload = transfer([files[1]!.relativePath, files[0]!.relativePath])
  const result = await spaceFileDocumentDrop.resolve({
    documentKey: "note.md",
    dataTransfer: payload,
    signal: new AbortController().signal,
  })
  expect(result.map((file) => file.path)).toEqual([
    "/docs/report.pdf",
    `/other/${encodeURIComponent(files[0]!.name)}`,
  ])
  expect(result[0]!.imageUrl).toBeUndefined()
  expect(result[1]!.imageUrl).toBe(result[1]!.path)
})
it.each([
  "../outside.png",
  "/absolute.png",
  "C:/absolute.png",
  ".graft/private.png",
  "a/../escape.png",
  "a\\file.png",
  "a/\u0001bad.png",
])("rejects an invalid path before searching: %s", async (path) => {
  const search = vi.fn()
  Object.assign(window, { eidosLite: { searchSpacePaths: search } })
  expect(
    await spaceFileDocumentDrop.resolve({
      documentKey: "note",
      dataTransfer: transfer([path]),
      signal: new AbortController().signal,
    })
  ).toEqual([])
  expect(search).not.toHaveBeenCalled()
})
it("does not claim external Files, links, text, or unscoped legacy drags", () => {
  for (const types of [
    ["Files"],
    ["text/plain"],
    ["text/uri-list"],
    [EIDOS_LITE_SPACE_PATH_DRAG_TYPE],
  ])
    expect(spaceFileDocumentDrop.accepts(types)).toBe(false)
  expect(spaceFileDocumentDrop.accepts(transfer(["a.png"]).types)).toBe(true)
})
it.each(["changed-space", "aborted"])(
  "discards results when the target becomes %s",
  async (mode) => {
    const controller = new AbortController()
    let calls = 0
    Object.assign(window, {
      eidosLite: {
        getSpace: async () => ({
          id: mode === "changed-space" && calls++ ? "Space-B" : "Space-A",
        }),
        searchSpacePaths: async () => {
          if (mode === "aborted") controller.abort()
          return [
            { name: "a.png", relativePath: "a.png", kind: "file", score: 1 },
          ]
        },
      },
    })
    expect(
      await spaceFileDocumentDrop.resolve({
        documentKey: "note",
        dataTransfer: transfer(["a.png"]),
        signal: controller.signal,
      })
    ).toEqual([])
  }
)
