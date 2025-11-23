import type { BaseDocTable } from "./base";

// Common search utilities
export interface SearchOptions {
  tableName: string;
  fieldName: string;
  highlightTag: string; // 'b' for <b> or 'mark' for <mark>
  contextLength: number; // character limit for result
  dataSpace: any; // database interface
  transformResult?: (row: any) => any; // optional result transformation
}

export async function performTrigramSearch(
  keywords: string[],
  options: SearchOptions
): Promise<any[]> {
  const { tableName, fieldName, highlightTag, contextLength, dataSpace, transformResult } = options;

  try {
    // Build LIKE conditions for each keyword (AND logic)
    const conditions = keywords.map(() => `${fieldName} LIKE ?`).join(" AND ");
    const params = keywords.map(kw => `%${kw}%`);

    // Build the main search query
    const sql = `
      SELECT *, length(${fieldName}) as len
      FROM ${tableName}
      WHERE ${conditions} AND ${fieldName} IS NOT NULL
      ORDER BY len ASC
      LIMIT 100
    `;

    const res = await dataSpace.exec2(sql, params);

    // Transform results with keyword highlighting
    return res.map((row: any) => {
      const originalText = row[fieldName] || '';

      // Truncate the original text first to avoid breaking HTML tags
      const truncatedText = originalText.length > contextLength
        ? originalText.substring(0, contextLength) + '...'
        : originalText;

      // Apply keyword highlighting to the truncated text
      let highlightedResult = truncatedText;

      // Create a regex that matches any of the keywords (case-insensitive)
      const keywordPatterns = keywords.map(keyword =>
        keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      );
      const combinedRegex = new RegExp(`(${keywordPatterns.join('|')})`, 'gi');

      // Replace all matches with highlighted versions
      highlightedResult = highlightedResult.replace(combinedRegex, `<${highlightTag}>$1</${highlightTag}>`);

      // Apply custom transformation if provided
      if (transformResult) {
        return {
          ...transformResult(row),
          result: highlightedResult
        };
      }

      // Default result format
      return {
        id: row.id,
        result: highlightedResult
      };
    });

  } catch (error) {
    console.error('Search failed:', error);
    return [];
  }
}

// Mixin to add search-specific methods
type Constructor<T = {}> = new (...args: any[]) => T & BaseDocTable;

export function WithSearch<T extends Constructor>(Base: T) {
    return class SearchDocTableMixin extends Base {


        async rebuildIndex(opts: {
            refillNullMarkdown?: boolean;
        }) {
            const { refillNullMarkdown } = opts;

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

            console.log(`rebuild ${this.dataSpace.dbName} index`)
        }
        /**
         * Search documents using trigram index with LIKE queries for multi-keyword AND search
         *
         * @param query The search query string (space-separated keywords)
         * @param options Optional search configuration (kept for backward compatibility)
         * @returns Array of search results with document ID and highlighted snippets
         *
         * @example
         * // Basic multi-keyword search (AND logic)
         * const results = await docTable.search('文件 图片'); // finds docs containing both "文件" and "图片"
         *
         * // Single keyword search
         * const results = await docTable.search('笔记'); // finds docs containing "笔记"
         */
        async search(query: string, options?: { allowAdvanced?: boolean }): Promise<{ id: string; result: string }[]> {
            if (!query || typeof query !== 'string') {
                return [];
            }

            const trimmedQuery = query.trim();
            if (!trimmedQuery) {
                return [];
            }

            // Split query into keywords by spaces, filter out empty strings
            const keywords = trimmedQuery.split(/\s+/).filter(k => k.length > 0);
            if (keywords.length === 0) {
                return [];
            }

            return performTrigramSearch(keywords, {
                tableName: this.name,
                fieldName: 'markdown',
                highlightTag: 'b',
                contextLength: 63,
                dataSpace: this.dataSpace
            });
        }
    };
}
