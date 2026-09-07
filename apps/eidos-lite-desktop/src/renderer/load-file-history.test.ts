import { loadFileHistoryBatch } from "./load-file-history"
import type { FileHistoryPage } from "../shared/path-history"

const page = (cursor: string | null): FileHistoryPage => ({
  path: "note.md",
  start: "head",
  commits: [],
  has_more: cursor !== null,
  next_cursor: cursor,
  telemetry: {
    commits_scanned: 100,
    commit_objects_read: 100,
    tree_objects_read: 100,
    object_bytes_read: 100,
    blob_objects_read: 0,
  },
})

it("automatically crosses empty pages and retries transient cancellation", async () => {
  const read = vi
    .fn()
    .mockRejectedValueOnce(new Error("AbortError: cancelled"))
    .mockResolvedValueOnce(page("next"))
    .mockResolvedValueOnce(page(null))
  const onPage = vi.fn()
  await loadFileHistoryBatch({ read, current: () => true, onPage })
  expect(read).toHaveBeenCalledTimes(3)
  expect(read).toHaveBeenLastCalledWith("next")
  expect(onPage).toHaveBeenCalledTimes(2)
})

it("bounds automatic scanning and stops immediately after closing", async () => {
  let index = 0
  const read = vi.fn(async () => page(String(++index)))
  await loadFileHistoryBatch({ read, current: () => true, onPage: () => {} })
  expect(read).toHaveBeenCalledTimes(20)
  let current = true
  read.mockClear()
  await loadFileHistoryBatch({
    read,
    current: () => current,
    onPage: () => {
      current = false
    },
  })
  expect(read).toHaveBeenCalledOnce()
})
