import { MsgType } from "@/lib/const";
import type { BaseDocTable, IDoc } from "./base";
import { parseFrontmatter } from "./helper";
import type { Email } from "postal-mime";

// Mixin to add Markdown-specific methods
type Constructor<T = {}> = new (...args: any[]) => T & BaseDocTable;

export function WithMarkdown<T extends Constructor>(Base: T) {
    return class MarkdownDocTableMixin extends Base {
        /**
         * for now lexical's code node depends on the browser's dom, so we can't use lexical in worker.
         * wait for lexical improve code node to support worker
         * @param type
         * @param data
         * @returns
         */
        callMain = (
            type:
                | MsgType.GetDocMarkdown
                | MsgType.ConvertMarkdown2State
                | MsgType.ConvertHtml2State
                | MsgType.ConvertEmail2State,
            data: any
        ) => {
            return this.dataSpace.callRenderer?.(type, data)
        }

        async listAllDayPages() {
            const res = await this.dataSpace.exec2(
                `SELECT id FROM ${this.name} WHERE is_day_page = 1 AND markdown != '' ORDER BY id DESC`
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

        async getMarkdown(id: string): Promise<string> {
            const doc = await this.get(id)
            return doc?.markdown || ""
            // const res = await callMain(MsgType.GetDocMarkdown, doc?.content)
            // return res as string
        }

        async getBaseInfo(id: string): Promise<Partial<IDoc>> {
            const res = await this.dataSpace.exec2(
                `SELECT id, created_at, updated_at FROM ${this.name} WHERE id = ?`,
                [id]
            )
            return res[0]
        }


        async createOrUpdateWithMarkdown(id: string, mdStr: string) {
            const content = (await this.callMain(
                MsgType.ConvertMarkdown2State,
                mdStr
            )) as string
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
                    const content = (await this.callMain(
                        MsgType.ConvertHtml2State,
                        text
                    )) as string

                    const markdown = (await this.callMain(
                        MsgType.GetDocMarkdown,
                        content
                    )) as string
                    return this._createOrUpdate(id, content, markdown, mode)

                case "markdown":
                    const content2 = (await this.callMain(
                        MsgType.ConvertMarkdown2State,
                        text
                    )) as string
                    return this._createOrUpdate(id, content2, text as string, mode)
                case "email":
                    const content3 = (await this.callMain(MsgType.ConvertEmail2State, {
                        space: this.dataSpace.dbName,
                        email: text,
                    })) as string
                    const markdown3 = (await this.callMain(
                        MsgType.GetDocMarkdown,
                        content3
                    )) as string
                    return this._createOrUpdate(id, content3, markdown3, mode)
                default:
                    throw new Error(`unknown type ${type}`)
            }
        }

        static mergeState = (oldState: string, newState: string) => {
            const _oldState = JSON.parse(
                oldState
            )

            const _appendState = JSON.parse(
                newState
            )

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
                                markdown: markdown + "\n" + res.markdown,
                            })
                            // Do not handle custom properties in prepend mode
                            break

                        case "append":
                            await this.set(id, {
                                id,
                                is_day_page,
                                content: MarkdownDocTableMixin.mergeState(res.content, content),
                                markdown: res.markdown + "\n" + markdown,
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


    };
}