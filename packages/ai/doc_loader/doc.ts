import type { DataSpace } from "@/packages/core/data-space"
import chunk from "lodash/chunk"

import type { BaseLoader } from "./base"

export class DocLoader implements BaseLoader {
  constructor(private dataSpace: DataSpace) {}
  async load(docId: string) {
    const markdown = await this.dataSpace.getDocMarkdown(docId)
    // split markdown into pages,every 100 lines is a page
    const lines = markdown?.split("\n")
    if (!lines) {
      return []
    }
    const pages: {
      content: string
      meta: Record<string, any>
    }[] = []
    chunk(lines, 20).forEach((chunk, index) => {
      pages.push({
        content: chunk.join("\n"),
        meta: {
          id: docId,
          index,
        },
      })
    })
    return pages
  }
}
