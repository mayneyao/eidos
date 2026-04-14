import { defineAdapter, $ } from "../../index.js"

export default defineAdapter({
  meta: {
    site: "ituring",
    name: "shelf",
    description: "iTuring Shelf",
    domain: "www.ituring.com.cn",
    version: "1.0",
  },

  protocol: {
    strategy: "cookie",
    browser: true,
    entryPoint: "https://www.ituring.com.cn",
  },

  /**
   * Step 1: Fetch raw data
   */
  async fetch(ctx) {
    const { browser } = ctx

    await browser.navigate("https://m.ituring.com.cn")
    await browser.settle(3000)

    const allBooks: any[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const result = await browser.evaluate<any, [number]>(async (pageNum) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore localStorage is available in browser context
        const accessToken = localStorage.getItem("accessToken")
        const res = await fetch(
          `https://api.ituring.com.cn/api/User/ShelfEBook?page=${pageNum}&query=&desc=true`,
          {
            credentials: "include",
            headers: {
              accept: "application/json, text/plain, */*",
              "accept-language": "en-US",
              Authorization: `bearer ${accessToken}`,
            },
          }
        )
        if (!res.ok) throw new Error("HTTP " + res.status)
        const data = await res.json()
        return data
      }, page)

      // Process return data
      const books: any[] = result.bookItems || []

      if (books.length === 0) {
        hasMore = false
      } else {
        allBooks.push(...books)
        page++
        hasMore = result.pagination?.hasNextPage ?? false
      }
    }

    return allBooks.map((item: any, index: number) => ({
      entityType: "book",
      entityId: String(item.bookId || item.id || item.ebookId || item.isbn),
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

    // Extract author information
    const authors = $.get<any[]>(book, "authors") || []
    const authorNames = authors
      .map((a) => $.string(a, "authorNameString"))
      .filter(Boolean)
    const firstAuthor = authorNames[0] || "Unknown Author"
    const authorId = $.id("author", firstAuthor)

    const bookId = $.id(
      "book",
      String(book.bookId || book.id || book.ebookId || book.isbn || index)
    )

    // Construct cover URL
    let coverUrl = book.coverUrl || book.cover || book.image || book.img
    if (!coverUrl && book.coverFileName) {
      coverUrl = `https://file.ituring.com.cn/SmallCover/${book.coverFileName}`
    }

    return {
      agents: [
        {
          id: authorId,
          role: "producer" as const,
          name: firstAuthor,
          fingerprints: $.fingerprint("ituring", firstAuthor),
        },
      ],

      goods: [
        {
          id: bookId,
          category: "book" as const,
          title: $.string(book, "name", $.string(book, "title", "No title")),
          summary:
            $.get(book, "intro") ||
            $.get(book, "description") ||
            $.get(book, "summary"),
          producedBy: authorId,
          fingerprints: $.fingerprint(
            "ituring",
            book.id,
            "isbn",
            book.isbn,
            "bookId",
            book.bookId
          ),
          useValue: {
            pages: book.pageCount || book.pages || null,
            language: "zh",
            coverUrl: coverUrl,
          },
          exchangeValue: {
            rating: book.rating || book.score || null,
            price: book.price || book.originalPrice || null,
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
            addedAt: book.addTime || book.createTime || book.purchaseTime,
            source: "ituring_shelf",
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
            addedAt: book.addTime || book.createTime,
            position: index,
          },
        },
        // CONSUMES: My reading status
        {
          type: "CONSUMES" as const,
          subject_type: "agent" as const,
          subject_id: "me",
          object_type: "good" as const,
          object_id: bookId,
          context: {
            progress: Math.round((book.progress || 0) * 100),
            lastReadAt: book.lastReadTime || book.updateTime,
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
        json_extract(data, '$.name') as title,
        json_extract(data, '$.authorNameString') as author,
        json_extract(data, '$.abstract') as abstract,
        json_extract(data, '$.isbn') as isbn,
        'https://file.ituring.com.cn/SmallCover/' || json_extract(data, '$.coverKey') as cover
      FROM raw.data
      where source = 'ituring/shelf'
    `,
  },
})
