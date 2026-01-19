import { useCallback } from "react"
import type { IExtension } from "@/packages/core/types/IExtension"
import { useSqlite } from "./use-sqlite"

export interface ISearchExtensions extends IExtension {
  result?: string
  mode: "extension" | "fts"
}

/**
 * Sanitize search query for trigram-based LIKE search
 * Simply trims the query - no need for FTS5-style quoting since we use LIKE
 */
function sanitizeSearchQuery(query: string): string {
  // Remove leading/trailing whitespace
  return query.trim()
}

export const useQueryExtension = () => {
  const { sqlite } = useSqlite()

  const queryExtensions = useCallback(async (q: string): Promise<ISearchExtensions[]> => {
    if (!sqlite) return []

    // Search by slug, name, and description
    const extensions = await sqlite.extension.findMany({
      where: {
        OR: [
          { slug: { contains: q } },
        ]
      }
    })

    return extensions.map(ext => ({
      ...ext,
      mode: "extension" as const
    }))
  }, [sqlite])

  const fullTextSearchExtensions = useCallback(async (q: string): Promise<ISearchExtensions[]> => {
    if (!sqlite) return []

    try {
      // Sanitize query to prevent FTS5 syntax errors
      const sanitizedQuery = sanitizeSearchQuery(q)
      if (!sanitizedQuery) return []

      const results = await sqlite.extension.fullTextSearchExtensions(sanitizedQuery)

      return results.map(ext => ({
        ...ext,
        mode: "fts" as const
      }))
    } catch (error) {
      // If FTS search fails (e.g., due to syntax error), log and return empty array
      console.warn('FTS search failed, falling back to empty results:', error)
      return []
    }
  }, [sqlite])

  return { queryExtensions, fullTextSearchExtensions }
}
