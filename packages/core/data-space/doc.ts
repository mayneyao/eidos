import { isDayPageId } from "@/lib/utils"
import { timeit } from "../helper"
import { TreeNodeType } from "../types/ITreeNode"
import { DataSpaceWithFile } from "./file"

// Extension class to add document-related methods
export class DataSpaceWithDoc extends DataSpaceWithFile {
  @timeit(100)
  public async addDoc(
    docId: string,
    content: string,
    markdown: string,
    isDayPage = false
  ) {
    await this.doc.add({ id: docId, content, markdown, is_day_page: isDayPage })
  }

  // update doc mount on sqlite for now,maybe change to fs later
  public async updateDoc(
    docId: string,
    content: string,
    markdown: string,
    _isDayPage = false
  ) {
    const res = await this.doc.get(docId)
    // yyyy-mm-dd is day page
    const isDayPage = _isDayPage || /^\d{4}-\d{2}-\d{2}$/g.test(docId)
    if (!res) {
      await this.doc.add({
        id: docId,
        content,
        markdown,
        is_day_page: isDayPage,
      })
    } else {
      // only update when content or markdown changed
      if (res.content !== content || res.markdown !== markdown) {
        console.log("doc really changed", docId)
        await this.doc.set(docId, {
          id: docId,
          content,
          markdown,
          is_day_page: isDayPage,
        })
      }
    }
  }

  public async getDoc(docId: string) {
    const doc = await this.doc.get(docId)
    return doc?.content
  }

  public async getDocMarkdown(docId: string, {
    withTitle = false,
  }: {
    withTitle?: boolean
  } = {}) {
    const doc = await this.doc.get(docId)
    if (withTitle) {
      if (isDayPageId(docId)) {
        return `# ${docId}\n\n${doc?.markdown}`
      } else {
        const node = await this.tree.get(docId)
        return `# ${node?.name}\n\n${doc?.markdown}`
      }
    }
    return doc?.markdown
  }

  public async getDocMarkdownBatch(docIds: string[]) {
    return this.doc.getMarkdownBatch(docIds)
  }

  public async searchDayPages(term: string, page: number = 0, pageSize: number = 20) {
    return this.doc.searchDayPages(term, page, pageSize)
  }

  /**
   * if you want to create or update a day page, you should pass a day page id. page id is like 2021-01-01
   * @param docId
   * @param mdStr
   * @param parent_id
   * @returns
   */
  public async createOrUpdateDocWithMarkdown(
    docId: string,
    mdStr: string,
    parent_id?: string,
    title?: string,
    mode?: "replace" | "append" | "prepend"
  ) {
    return this.createOrUpdateDoc({
      docId,
      content: mdStr,
      type: "markdown",
      parent_id,
      title,
      mode
    })
  }

  public async createOrUpdateDoc(data: {
    docId: string
    content: string
    type: "html" | "markdown" | "email"
    parent_id?: string
    title?: string
    mode?: "replace" | "append" | "prepend"
  }) {
    if (isDayPageId(data.docId)) {
      return this.doc.createOrUpdate({
        id: data.docId,
        text: data.content,
        type: data.type,
        mode: data.mode,
      })
    } else {
      return this.db.transaction(async () => {
        await this.tree.getOrCreateNode({
          id: data.docId,
          name: data.title || data.docId,
          parent_id: data.parent_id,
          type: TreeNodeType.Doc,
        })
        return await this.doc.createOrUpdate({
          id: data.docId,
          text: data.content,
          type: data.type,
          mode: data.mode,
        })
      })
    }
  }

  public async deleteDoc(docId: string) {
    await this.doc.del(docId)
  }

  public async listAllDocIds() {
    const res = await this.doc.list({
    }, {
      fields: ["id"]
    })
    return res.map((doc) => doc.id)
  }

  public async fullTextSearch(query: string) {
    return this.doc.search(query, { onlyDayPages: true })
  }

  public async listDays(page: number) {
    return await this.doc.listDayPage(page)
  }

  public async listAllDays() {
    return await this.doc.listAllDayPages()
  }

  // FIXME: there are some problem with headless lexical run in worker
  // return markdown string, compute in worker
  // public async asyncGetDocMarkdown(docId: string) {
  //   const doc = await this.doc.get(docId)
  //   if (!doc) {
  //     throw new Error(`doc ${docId} not found`)
  //   }
  //   return await _getDocMarkdown(doc.markdown)
  // }
}
