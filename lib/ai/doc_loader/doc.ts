import { DataSpace } from "@/worker/web-worker/DataSpace"
import { chunk } from "lodash"

import { BaseLoader } from "./base"

export class DocLoader implements BaseLoader {
  constructor(private dataSpace: DataSpace) {}
  async load(docId: string) {
    const markdown = await this.dataSpace.getDocMarkdown(docId)
    // split markdown into pages,every 100 lines is a page
    const lines = markdown.split("\n").filter((line) => line.trim() !== "")
    const pages: {
      content: string
      meta: Record<string, any>
    }[] = []
    chunk(lines, 100).forEach((chunk, index) => {
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
