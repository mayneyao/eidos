import { defineAdapter, $ } from "../../index.js"

export default defineAdapter({
  meta: {
    site: "weread",
    name: "shelf",
    description: "WeRead Shelf",
    domain: "weread.qq.com",
    version: "1.0",
  },

  protocol: {
    strategy: "cookie",
    browser: true,
    entryPoint: "https://weread.qq.com/web/shelf",
  },

  /**
   * Step 1: Fetch raw data
   */
  async fetch(ctx) {
    const { browser } = ctx

    // Ensure we are on weread.qq.com to have the cookies
    await browser.navigate("https://weread.qq.com")
    await browser.settle(3000)

    const result = await browser.evaluate<any[], []>(async () => {
      // Fetch from the sync API - no userVid needed if credentials are included
      const response = await fetch(
        "/web/shelf/sync?synckey=0&lectureSynckey=0",
        {
          credentials: "include",
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch shelf: ${response.status}`)
      }

      const data = (await response.json()) as any
      if (data?.errCode === -2010) {
        throw new Error("Not logged in to WeChat Reading")
      }

      const books = (data?.books as any[]) || []
      const progress = (data?.bookProgress as any[]) || []
      const progressMap: Record<string, any> = {}
      progress.forEach((p: any) => {
        progressMap[p.bookId] = p.progress
      })

      return books.map((item: any) => ({
        ...item,
        readingProgress: progressMap[item.bookId],
      }))
    })

    return result.map((item: any, index: number) => ({
      entityType: "book",
      entityId: String(item.bookId),
      data: item,
      meta: { index },
    }))
  },

  /**
   * Step 2: Transform to Economic model
   */
  transform(raw) {
    const book = raw.data
    const index = raw.meta?.index ?? 0

    const author = $.string(book, "author", "Unknown Author")
    const authorId = $.id("author", author)
    const bookId = $.id("book", String(book.bookId))

    return {
      agents: [
        {
          id: authorId,
          role: "producer" as const,
          name: author,
          fingerprints: $.fingerprint("weread", author),
        },
      ],

      goods: [
        {
          id: bookId,
          category: "book" as const,
          title: $.string(book, "title", "No title"),
          summary: $.string(book, "intro", $.string(book, "description", "")),
          producedBy: authorId,
          fingerprints: $.fingerprint("weread", String(book.bookId)),
          useValue: {
            language: "zh",
            coverUrl: $.string(book, "cover", ""),
          },
        },
      ],

      relations: [
        // OWNS: Book is on my shelf
        {
          type: "OWNS" as const,
          subject_type: "agent" as const,
          subject_id: "me",
          object_type: "good" as const,
          object_id: bookId,
          context: {
            source: "weread_shelf",
            addedAt: book.updateTime,
          },
        },
        // CONTAINS: Book is in the default shelf
        {
          type: "CONTAINS" as const,
          subject_type: "good" as const,
          subject_id: "shelf-default",
          object_type: "good" as const,
          object_id: bookId,
          context: {
            position: index,
          },
        },
        // CONSUMES: Reading progress
        {
          type: "CONSUMES" as const,
          subject_type: "agent" as const,
          subject_id: "me",
          object_type: "good" as const,
          object_id: bookId,
          context: {
            progress: book.readingProgress, // This is usually an integer or percentage
            lastReadAt: book.updateTime, // Using updateTime as a proxy for last active
          },
        },
      ],
    }
  },

  queries: {
    raw: `
      -- @search {title, author}
      -- [title:text]
      -- [cover:file]
      SELECT 
        id,
        json_extract(data, '$.title') as title,
        json_extract(data, '$.author') as author,
        json_extract(data, '$.cover') as cover,
        json_extract(data, '$.readingProgress') || '%' as progress,
        json_extract(data, '$.format') as format
      FROM raw.data
      where source = 'weread/shelf'
    `,
  },
})
