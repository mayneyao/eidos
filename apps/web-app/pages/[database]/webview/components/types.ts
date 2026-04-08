export interface OpenDataAdapter {
  site: string
  name: string
  description?: string
  domain: string
  filePath: string
  /**
   * Pre-defined SQL queries for displaying data in table view.
   * Each query should include -- @db: opendata header.
   * Use -- @search {field1,field2} to enable search on specific fields.
   *
   */
  queries?: Record<string, string>
}

export type ViewMode = "browser" | "table"
