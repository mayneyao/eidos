/**
 * Helper functions for document operations
 */

/**
 * Reserved property names that cannot be used as custom properties
 */
export const RESERVED_PROPERTIES = [
  "id",
  "content",
  "markdown",
  "is_day_page",
  "created_at",
  "updated_at",
  "properties",
  "meta", // Now used for display configuration
]

/**
 * Utility function to escape FTS queries safely
 * @param query Raw user input query
 * @param allowAdvanced Whether to allow advanced FTS syntax
 * @returns Escaped query safe for FTS
 */
export function escapeFTSQuery(query: string, allowAdvanced: boolean = false): string {
  if (!query || typeof query !== 'string') {
    return '';
  }

  const trimmedQuery = query.trim();

  // Check if query looks like it contains intentional FTS syntax
  const looksAdvanced = /^["'].*["']$/.test(trimmedQuery) || // Quoted phrases
    /\b(AND|OR|NOT|NEAR)\b/i.test(trimmedQuery) || // Boolean operators
    /\*/.test(trimmedQuery) || // Wildcards
    /^\+/.test(trimmedQuery); // Prefix search

  // If advanced syntax is allowed and query looks intentional
  if (allowAdvanced && looksAdvanced) {
    // Only escape unmatched quotes and basic cleanup
    return trimmedQuery
      .replace(/"/g, (match, offset, string) => {
        // Count quotes before this position
        const beforeQuotes = (string.substring(0, offset).match(/"/g) || []).length;
        // If odd number of quotes before, this might be unmatched
        return beforeQuotes % 2 === 0 ? '"' : '';
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  // For regular user input, wrap in quotes for exact phrase matching
  // This allows searching for special characters like brackets safely
  // Escape any existing quotes in the content first
  const escaped = trimmedQuery.replace(/"/g, '""');

  // Wrap the entire query in quotes for exact phrase matching
  return `"${escaped}"`;
}

/**
 * Parse YAML frontmatter from markdown content
 * @param markdown markdown content
 * @returns parsed custom properties object
 */
export function parseFrontmatter(markdown: string): Record<string, any> {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = markdown.match(frontmatterRegex)

  if (!match) {
    return {}
  }

  const frontmatterStr = match[1]
  const properties: Record<string, any> = {}

  // Simple YAML parsing (only supports key: value format)
  const lines = frontmatterStr.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const key = trimmed.substring(0, colonIndex).trim()
    let value = trimmed.substring(colonIndex + 1).trim()

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    properties[key] = value
  }

  return properties
}

/**
 * Validate if custom property name is valid
 * @param propertyName property name
 * @returns whether it is valid
 */
export function isValidPropertyName(propertyName: string): boolean {
  // Check if it is a reserved property
  if (RESERVED_PROPERTIES.includes(propertyName)) {
    return false
  }

  // Check if it starts with _
  if (propertyName.startsWith('_')) {
    return false
  }

  // Check if it contains special characters (only letters, numbers, underscores allowed)
  const validNameRegex = /^[a-zA-Z0-9_]+$/
  return validNameRegex.test(propertyName)
}

/**
 * Filter valid custom properties
 * @param properties properties object
 * @returns filtered valid properties object
 */
export function filterValidProperties(properties: Record<string, any>): Record<string, any> {
  const validProperties: Record<string, any> = {}

  for (const [key, value] of Object.entries(properties)) {
    if (isValidPropertyName(key)) {
      validProperties[key] = value
    }
  }

  return validProperties
}
