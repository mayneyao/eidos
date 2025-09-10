import type { BaseDocTable } from "./base";
import { escapeFTSQuery } from "./helper";

// Mixin to add search-specific methods
type Constructor<T = {}> = new (...args: any[]) => T & BaseDocTable;

export function WithSearch<T extends Constructor>(Base: T) {
    return class SearchDocTableMixin extends Base {


        async rebuildIndex(opts: {
            refillNullMarkdown?: boolean;
            recreateFtsTable?: boolean;
        }) {
            const { refillNullMarkdown, recreateFtsTable } = opts;

            if (recreateFtsTable) {
                // Drop triggers first
                await this.dataSpace.db.exec(`
        DROP TRIGGER IF EXISTS ${this.name}_ai;
        DROP TRIGGER IF EXISTS ${this.name}_ad;
        DROP TRIGGER IF EXISTS ${this.name}_au;
      `);
                // Then drop the FTS table
                await this.dataSpace.exec2(`DROP TABLE IF EXISTS fts_docs;`);
                // Recreate the FTS table
                await this.dataSpace.exec2(this.createFTSSql);
                console.log(`Recreated fts_docs table and triggers for ${this.dataSpace.dbName}`);
            }

            await this.dataSpace.exec2(
                `INSERT INTO fts_docs(fts_docs) VALUES('rebuild');`
            )
            if (refillNullMarkdown) {
                const res = await this.dataSpace.exec2(
                    `SELECT id, markdown FROM ${this.name}`
                )
                for (const item of res) {
                    if (item.markdown == null) {
                        const doc = await this.get(item.id)
                        const markdown = doc?.markdown || ""
                        try {
                            await this.dataSpace.exec2(
                                `UPDATE ${this.name} SET markdown = ? WHERE id = ?`,
                                [markdown, item.id]
                            )
                            console.log(`update ${item.id} markdown`)
                        } catch (error) {
                            console.warn(`update ${item.id} markdown error`, error)
                        }
                    }
                }
            }
            await this.dataSpace.exec2(
                `INSERT INTO fts_docs(fts_docs) VALUES('rebuild');`
            )
            console.log(`rebuild ${this.dataSpace.dbName} index`)
        }
        /**
         * Search documents using full-text search with progressive query processing
         *
         * @param query The search query string
         * @param options Optional search configuration (kept for backward compatibility)
         * @returns Array of search results with document ID and highlighted snippets
         *
         * @example
         * // Basic search
         * const results = await docTable.search('hello world');
         *
         * // Advanced FTS syntax (automatically detected and handled)
         * const results = await docTable.search('"exact phrase" AND keyword*');
         */
        async search(query: string, options?: { allowAdvanced?: boolean }): Promise<{ id: string; result: string }[]> {
            if (!query || typeof query !== 'string') {
                return [];
            }

            const trimmedQuery = query.trim();
            if (!trimmedQuery) {
                return [];
            }

            // First try: Use the original query directly (supports advanced FTS syntax)
            try {
                const res = await this.dataSpace.exec2(
                    `SELECT id, snippet(fts_docs, 1, '<b>', '</b>','...',127) as result FROM fts_docs WHERE fts_docs MATCH ?;`,
                    [trimmedQuery]
                );

                // If we found results with original query, return them
                if (res.length > 0) {
                    return res.reverse();
                }
            } catch (error) {
                console.log('Original query failed, trying escaped version:', error instanceof Error ? error.message : String(error));
            }

            // Second try: Use safe escaping (exact phrase match)
            try {
                const escapedQuery = escapeFTSQuery(trimmedQuery, false);
                if (escapedQuery && escapedQuery !== trimmedQuery) {
                    const res = await this.dataSpace.exec2(
                        `SELECT id, snippet(fts_docs, 1, '<b>', '</b>','...',127) as result FROM fts_docs WHERE fts_docs MATCH ?;`,
                        [escapedQuery]
                    );

                    if (res.length > 0) {
                        return res.reverse();
                    }
                }
            } catch (error) {
                console.log('Escaped query also failed:', error instanceof Error ? error.message : String(error));
            }

            // Third try: If query contains special chars, try a more permissive search by tokenizing
            if (/[\[\]\(\)\-\+\*\&\|\!\@\#\$\%\^\~]/.test(trimmedQuery)) {
                try {
                    // Remove special characters and search for individual words
                    const cleanQuery = trimmedQuery
                        .replace(/[\[\]\(\)\-\+\*\&\|\!\@\#\$\%\^\~]/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();

                    if (cleanQuery) {
                        console.log('Trying permissive search with:', cleanQuery);
                        const fallbackRes = await this.dataSpace.exec2(
                            `SELECT id, snippet(fts_docs, 1, '<b>', '</b>','...',127) as result FROM fts_docs WHERE fts_docs MATCH ?;`,
                            [cleanQuery]
                        );
                        return fallbackRes.reverse();
                    }
                } catch (fallbackError) {
                    console.error('Fallback search also failed:', fallbackError);
                }
            }

            // If all searches fail, return empty results instead of throwing
            return [];
        }
    };
}
