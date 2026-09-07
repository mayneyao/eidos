import type { FileHistoryPage } from "../shared/path-history"

/** Continue sparse pages without making the user operate the SDK cursor. */
export async function loadFileHistoryBatch(options: {
  read(cursor?: string): Promise<FileHistoryPage>
  cursor?: string
  current(): boolean
  onPage(page: FileHistoryPage): void
}) {
  const started = performance.now()
  let cursor = options.cursor
  let matches = 0
  let bytes = 0
  let retries = 0
  for (let pages = 0; pages < 20 && options.current(); ) {
    let page: FileHistoryPage
    try {
      page = await options.read(cursor)
    } catch (cause) {
      if (!options.current()) return
      if (
        /AbortError|cancelled|canceled/i.test(String(cause)) &&
        retries++ < 2 &&
        performance.now() - started < 2000
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }
      throw cause
    }
    if (!options.current()) return
    pages++
    options.onPage(page)
    matches += page.commits.length
    bytes += page.telemetry.object_bytes_read
    if (
      !page.has_more ||
      matches >= 20 ||
      bytes >= 128 * 1024 * 1024 ||
      performance.now() - started >= 2000
    )
      return
    if (!page.next_cursor || page.next_cursor === cursor)
      throw new Error("File history cursor did not advance")
    cursor = page.next_cursor
    // Yield between bounded requests so closing and selecting remain responsive.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
