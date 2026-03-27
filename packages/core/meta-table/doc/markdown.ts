import type { BaseDocTable, IDoc } from "./base"
import { parseFrontmatter } from "./helper"
import type { Email } from "postal-mime"

// Mixin to add Markdown-specific methods
type Constructor<T = {}> = new (...args: any[]) => T & BaseDocTable

export function WithMarkdown<T extends Constructor>(Base: T) {
  return class MarkdownDocTableMixin extends Base {
    /**
     * Unified conversion using context.lexical, completely in headless environment
     * No longer relies on frontend rendering, avoiding Lexical version inconsistency issues
     */
    getLexicalConverter() {
      const lexical = this.dataSpace.context.lexical
      if (!lexical) {
        throw new Error(
          "Lexical converter not available. Please ensure context.lexical is properly initialized."
        )
      }
      return lexical
    }

    /**
     * Markdown to Lexical State
     */
    async markdownToLexical(
      markdown: string,
      options?: { oldState?: string }
    ): Promise<string> {
      const lexical = this.getLexicalConverter()
      return lexical.markdown2lexical(markdown, [], [], options)
    }

    /**
     * Lexical State to Markdown
     */
    async lexicalToMarkdown(state: string): Promise<string> {
      const lexical = this.getLexicalConverter()
      return lexical.lexical2markdown(state)
    }

    /**
     * HTML to Lexical State
     */
    async htmlToLexical(html: string): Promise<string> {
      const lexical = this.getLexicalConverter()
      return lexical.convertHtml2State(html)
    }

    async listAllDayPages() {
      const res = await this.dataSpace.exec2(
        `SELECT id FROM ${this.name} WHERE is_day_page = 1 ORDER BY id DESC`
      )
      return res.map((item: any) => ({
        id: item.id,
      }))
    }

    async listDayPage(page: number = 0) {
      const pageSize = 7
      const res = await this.dataSpace.exec2(
        `SELECT id FROM ${this.name} WHERE is_day_page = 1 ORDER BY id DESC LIMIT ?,?`,
        [page * pageSize, pageSize]
      )
      return res.map((item: any) => ({
        id: item.id,
      }))
    }

    /**
     * Batch fetch markdown for a set of doc ids.
     */
    async getMarkdownBatch(
      ids: string[]
    ): Promise<{ id: string; markdown: string }[]> {
      if (!ids.length) return []
      const placeholders = ids.map(() => "?").join(",")
      try {
        const rows = await this.dataSpace.exec2(
          `SELECT id, markdown FROM ${this.name} WHERE id IN (${placeholders})`,
          ids
        )

        // preserve input order; missing ids return empty string instead of throwing
        const markdownMap = new Map<string, string>()
        rows.forEach((row: any) => {
          markdownMap.set(row.id, row.markdown || "")
        })
        return ids.map((id) => ({
          id,
          markdown: markdownMap.get(id) ?? "",
        }))
      } catch (error) {
        console.warn(
          "getMarkdownBatch failed, returning empty for missing ids",
          error
        )
        return ids.map((id) => ({
          id,
          markdown: "",
        }))
      }
    }

    async searchDayPages(
      term: string,
      page: number = 0,
      pageSize: number = 20
    ): Promise<{ id: string; markdown: string }[]> {
      const like = `%${term}%`
      const rows = await this.dataSpace.exec2(
        `SELECT id, markdown FROM ${this.name}
                 WHERE is_day_page = 1 AND (id LIKE ? OR markdown LIKE ?)
                 ORDER BY id DESC
                 LIMIT ?, ?`,
        [like, like, page * pageSize, pageSize]
      )
      return rows.map((row: any) => ({
        id: row.id,
        markdown: row.markdown || "",
      }))
    }

    async getMarkdown(id: string): Promise<string> {
      const doc = await this.get(id)
      return doc?.markdown || ""
    }

    async getBaseInfo(id: string): Promise<Partial<IDoc>> {
      const res = await this.dataSpace.exec2(
        `SELECT id, created_at, updated_at FROM ${this.name} WHERE id = ?`,
        [id]
      )
      return res[0]
    }

    async createOrUpdateWithMarkdown(id: string, mdStr: string) {
      // Get existing document content (for ID preservation)
      const existing = await this.get(id)
      const oldState = existing?.content

      // Use headless lexical conversion, pass old state to preserve IDs
      const content = await this.markdownToLexical(mdStr, { oldState })
      return this._createOrUpdate(id, content, mdStr)
    }

    async createOrUpdate(data: {
      id: string
      text: string | Email
      type: "html" | "markdown" | "email"
      mode?: "replace" | "append" | "prepend"
    }) {
      const { id, text, type, mode = "replace" } = data
      switch (type) {
        case "html":
          const content = await this.htmlToLexical(text as string)
          const markdown = await this.lexicalToMarkdown(content)
          return this._createOrUpdate(id, content, markdown, mode)

        case "markdown":
          // For append/prepend, use headless merge to avoid frontend rendering issues
          if (mode === "append" || mode === "prepend") {
            return this.createOrUpdateWithMerge(id, text as string, mode)
          }
          // replace mode: normal conversion
          const content2 = await this.markdownToLexical(text as string)
          return this._createOrUpdate(id, content2, text as string, mode)
        case "email":
          // Email conversion still needs special handling, temporarily keep as is
          // TODO: migrate email conversion to headless as well
          throw new Error(
            "Email conversion is not yet supported in headless mode"
          )
        default:
          throw new Error(`unknown type ${type}`)
      }
    }

    /**
     * Use headless merge to implement append/prepend
     * Completely in Node.js environment, no frontend rendering dependency
     */
    async createOrUpdateWithMerge(
      id: string,
      markdown: string,
      mode: "append" | "prepend"
    ) {
      // 1. Get existing document
      const existing = await this.get(id)
      if (!existing) {
        // Document doesn't exist, treat as replace
        const content = await this.markdownToLexical(markdown)
        return this._createOrUpdate(id, content, markdown, "replace")
      }

      // 2. Convert new Markdown to Lexical (don't pass oldState, as it's new content)
      const newContent = await this.markdownToLexical(markdown)

      // 4. Use headless merge to merge states
      const { mergeLexicalStates } = await import("@eidos.space/lexical")
      const mergedState = mergeLexicalStates(existing.content, newContent, mode)

      // 5. Build merged markdown
      const mergedMarkdown =
        mode === "prepend"
          ? markdown + existing.markdown
          : existing.markdown + markdown

      // 6. Save
      return this._createOrUpdate(
        id,
        JSON.stringify(mergedState),
        mergedMarkdown,
        "replace" // Already merged, save as replace
      )
    }

    static mergeState = (oldState: string, newState: string) => {
      const _oldState = JSON.parse(oldState)

      const _appendState = JSON.parse(newState)

      _oldState.root.children.push(..._appendState.root.children)
      return JSON.stringify(_oldState)
    }

    async _createOrUpdate(
      id: string,
      content: string,
      markdown: string,
      mode: "replace" | "append" | "prepend" = "replace"
    ) {
      let is_day_page = /^\d{4}-\d{2}-\d{2}$/.test(id)
      const res = await this.get(id)

      // Parse frontmatter custom properties from markdown
      const customProperties = parseFrontmatter(markdown)

      try {
        if (!res) {
          // Create new document
          await this.add({
            id,
            content,
            is_day_page,
            markdown,
          })

          // If there are custom properties, set them
          if (Object.keys(customProperties).length > 0) {
            await (this as any).setProperties(id, customProperties)
          }
        } else {
          switch (mode) {
            case "replace":
              await this.set(id, {
                id,
                is_day_page,
                content,
                markdown,
              })

              // Update custom properties
              if (Object.keys(customProperties).length > 0) {
                await (this as any).setProperties(id, customProperties)
              }
              break

            case "prepend":
              await this.set(id, {
                id,
                is_day_page,
                content: MarkdownDocTableMixin.mergeState(content, res.content),
                markdown: markdown + res.markdown,
              })
              // Do not handle custom properties in prepend mode
              break

            case "append":
              await this.set(id, {
                id,
                is_day_page,
                content: MarkdownDocTableMixin.mergeState(res.content, content),
                markdown: res.markdown + markdown,
              })
              // Do not handle custom properties in append mode
              break

            default:
              throw new Error(`unknown mode ${mode}`)
          }
        }
        return {
          id,
          success: true,
        }
      } catch (error) {
        console.error(error)
        return {
          id,
          success: false,
          msg: `${JSON.stringify(error)}`,
        }
      }
    }
  }
}
