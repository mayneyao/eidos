import { describe, it, expect } from 'vitest'
import { performTrigramSearch } from './search'

// Mock DataSpace for testing
class MockDataSpace {
  private data: any[] = []

  constructor(data: any[] = []) {
    this.data = data
  }

  async exec2(sql: string, params: any[] = []): Promise<any[]> {
    // Mock the trigram search query behavior
    if (sql.includes('LIKE') && sql.includes('markdown')) {
      // For search queries, return data that matches all keywords (AND logic)
      return this.data.filter(row => {
        const content = row.markdown || ''
        // If markdown is null, only return if no keywords (empty search)
        if (row.markdown === null || row.markdown === undefined) {
          return params.length === 0
        }
        return params.every((param: string) => {
          const keyword = param.replace(/%/g, '')
          return content.toLowerCase().includes(keyword.toLowerCase())
        })
      }).sort((a, b) => (b.markdown || '').length - (a.markdown || '').length) // Sort by length desc
        .slice(0, 100) // LIMIT 100
    }

    // For other queries, return all data
    return this.data
  }
}

describe('performTrigramSearch', () => {
  describe('keyword highlighting', () => {
    it('should highlight single keyword', async () => {
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: 'This is a test document' }
      ])

      const results = await performTrigramSearch(['test'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 100,
        dataSpace: mockDataSpace
      })

      expect(results).toHaveLength(1)
      expect(results[0].result).toBe('This is a <b>test</b> document')
    })

    it('should highlight multiple keywords without nesting', async () => {
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: 'testing functionality' }
      ])

      const results = await performTrigramSearch(['test', 'est'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 100,
        dataSpace: mockDataSpace
      })

      expect(results).toHaveLength(1)
      // Should highlight matches without creating nested HTML tags
      // Note: overlapping matches like "test" and "est" in "testing" result in only the first match being highlighted
      expect(results[0].result).toBe('<b>test</b>ing functionality')
    })

    it('should highlight overlapping keywords correctly', async () => {
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: 'The best testing framework' }
      ])

      const results = await performTrigramSearch(['test', 'est'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 100,
        dataSpace: mockDataSpace
      })

      expect(results).toHaveLength(1)
      // Should highlight "est" in "best" and "test" in "testing" without breaking HTML
      const result = results[0].result
      expect(result).toContain('<b>est</b>')
      expect(result).toContain('<b>test</b>')
      // Count opening and closing tags should be equal
      const openTags = (result.match(/<b>/g) || []).length
      const closeTags = (result.match(/<\/b>/g) || []).length
      expect(openTags).toBe(closeTags)
    })

    it('should handle case insensitive matching', async () => {
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: 'This is a TEST document' }
      ])

      const results = await performTrigramSearch(['test'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 100,
        dataSpace: mockDataSpace
      })

      expect(results).toHaveLength(1)
      expect(results[0].result).toBe('This is a <b>TEST</b> document')
    })

    it('should escape special regex characters in keywords', async () => {
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: 'This has special chars: test.*+?' }
      ])

      const results = await performTrigramSearch(['test.*+?'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 100,
        dataSpace: mockDataSpace
      })

      expect(results).toHaveLength(1)
      expect(results[0].result).toBe('This has special chars: <b>test.*+?</b>')
    })

    it('should use different highlight tags', async () => {
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: 'This is a test document' }
      ])

      const results = await performTrigramSearch(['test'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'mark',
        contextLength: 100,
        dataSpace: mockDataSpace
      })

      expect(results).toHaveLength(1)
      expect(results[0].result).toBe('This is a <mark>test</mark> document')
    })
  })

  describe('truncation', () => {
    it('should truncate long text before applying highlights', async () => {
      const longText = 'This is a very long document that contains some test content and more text'
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: longText }
      ])

      const results = await performTrigramSearch(['test'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 30, // Short context length
        dataSpace: mockDataSpace
      })

      expect(results).toHaveLength(1)
      const result = results[0].result
      expect(result.length).toBeLessThanOrEqual(33) // 30 + '...'
      expect(result.endsWith('...')).toBe(true)

      // The truncated text should still have valid HTML
      const openTags = (result.match(/<b>/g) || []).length
      const closeTags = (result.match(/<\/b>/g) || []).length
      expect(openTags).toBe(closeTags)
    })

    it('should not truncate if text is within context length', async () => {
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: 'Short test text' }
      ])

      const results = await performTrigramSearch(['test'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 100,
        dataSpace: mockDataSpace
      })

      expect(results).toHaveLength(1)
      expect(results[0].result).toBe('Short <b>test</b> text')
      expect(results[0].result.endsWith('...')).toBe(false)
    })

    it('should handle truncation with multiple keywords', async () => {
      const longText = 'This document contains testing and best practices for development'
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: longText }
      ])

      const results = await performTrigramSearch(['test', 'best'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 40,
        dataSpace: mockDataSpace
      })

      expect(results).toHaveLength(1)
      const result = results[0].result
      // After highlighting, the result may be longer than contextLength due to HTML tags
      // The key is that truncation happens before highlighting to avoid breaking tags
      expect(result.endsWith('...')).toBe(true)

      // HTML should still be valid
      const openTags = (result.match(/<b>/g) || []).length
      const closeTags = (result.match(/<\/b>/g) || []).length
      expect(openTags).toBe(closeTags)
    })
  })

  describe('edge cases', () => {
    it('should handle empty results', async () => {
      const mockDataSpace = new MockDataSpace([])

      const results = await performTrigramSearch(['test'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 100,
        dataSpace: mockDataSpace
      })

      expect(results).toEqual([])
    })

    it('should handle null or empty markdown field', async () => {
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: null },
        { id: 2, markdown: '' },
        { id: 3, markdown: 'test content' }
      ])

      const results = await performTrigramSearch(['test'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 100,
        dataSpace: mockDataSpace
      })

      // Null values are filtered out by the SQL query (IS NOT NULL condition)
      // Empty strings that don't contain the keyword are also filtered out
      expect(results).toHaveLength(1)
      expect(results[0].result).toBe('<b>test</b> content')
    })

    it('should handle multiple matches of same keyword', async () => {
      const mockDataSpace = new MockDataSpace([
        { id: 1, markdown: 'test test test' }
      ])

      const results = await performTrigramSearch(['test'], {
        tableName: 'docs',
        fieldName: 'markdown',
        highlightTag: 'b',
        contextLength: 100,
        dataSpace: mockDataSpace
      })

      expect(results).toHaveLength(1)
      expect(results[0].result).toBe('<b>test</b> <b>test</b> <b>test</b>')
    })
  })
})
