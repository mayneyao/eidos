import {
  parseColumnTypesFromComments,
  extractColumnTypeInfo,
  parseSearchableFieldsFromComments,
} from "./sql-comment-parser"
import { FieldType } from "../fields/const"

describe("SQL Comment Parser", () => {
  describe("parseColumnTypesFromComments", () => {
    it("should parse column types from comments", () => {
      const sql = `
        -- [col_1:text]
        -- [col_2:number]
        -- [col_3:checkbox]
        -- [col_4:url]
        -- [col_5:date]
        -- [col_6:rating]
        
        SELECT * FROM table1
      `

      const result = parseColumnTypesFromComments(sql)

      expect(result).toEqual({
        col_1: FieldType.Text,
        col_2: FieldType.Number,
        col_3: FieldType.Checkbox,
        col_4: FieldType.URL,
        col_5: FieldType.Date,
        col_6: FieldType.Rating,
      })
    })

    it("should handle comments with spaces", () => {
      const sql = `
        -- [ col_1 : text ]
        -- [col_2: number]
        -- [ col_3 :checkbox ]
        
        SELECT * FROM table1
      `

      const result = parseColumnTypesFromComments(sql)

      expect(result).toEqual({
        col_1: FieldType.Text,
        col_2: FieldType.Number,
        col_3: FieldType.Checkbox,
      })
    })

    it("should ignore invalid field types", () => {
      const sql = `
        -- [col_1:text]
        -- [col_2:invalid_type]
        -- [col_3:number]
        
        SELECT * FROM table1
      `

      const result = parseColumnTypesFromComments(sql)

      expect(result).toEqual({
        col_1: FieldType.Text,
        col_3: FieldType.Number,
      })
    })

    it("should handle case insensitive field types", () => {
      const sql = `
        -- [col_1:TEXT]
        -- [col_2:NUMBER]
        -- [col_3:CheckBox]
        
        SELECT * FROM table1
      `

      const result = parseColumnTypesFromComments(sql)

      expect(result).toEqual({
        col_1: FieldType.Text,
        col_2: FieldType.Number,
        col_3: FieldType.Checkbox,
      })
    })

    it("should handle inline comments", () => {
      const sql = `
        SELECT 
          id, -- [id:number]
          name, -- [name:text]
          email, -- [email:text]
          is_active -- [is_active:checkbox]
        FROM users
      `

      const result = parseColumnTypesFromComments(sql)

      expect(result).toEqual({
        id: FieldType.Number,
        name: FieldType.Text,
        email: FieldType.Text,
        is_active: FieldType.Checkbox,
      })
    })

    it("should handle mixed comment positions", () => {
      const sql = `
        -- [id:number]
        SELECT 
          id,
          name, -- [name:text]
          email,
          is_active -- [is_active:checkbox]
        FROM users
        -- [created_at:datetime]
        WHERE is_active = true
      `

      const result = parseColumnTypesFromComments(sql)

      expect(result).toEqual({
        id: FieldType.Number,
        name: FieldType.Text,
        is_active: FieldType.Checkbox,
        created_at: FieldType.DateTime,
      })
    })

    it("should return empty object for SQL without comments", () => {
      const sql = "SELECT * FROM table1"

      const result = parseColumnTypesFromComments(sql)

      expect(result).toEqual({})
    })
  })

  describe("extractColumnTypeInfo", () => {
    it("should extract column type info with detailed results", () => {
      const sql = `
        -- [col_1:text]
        -- [col_2:invalid_type]
        -- [col_3:number]
        -- [invalid_format]
        
        SELECT * FROM table1
      `

      const result = extractColumnTypeInfo(sql)

      expect(result.columnTypes).toEqual({
        col_1: FieldType.Text,
        col_3: FieldType.Number,
      })

      expect(result.invalidComments).toHaveLength(2)
      expect(result.invalidComments[0].reason).toBe(
        "Invalid field type: invalid_type"
      )
      expect(result.invalidComments[1].reason).toBe(
        "Invalid format. Expected: -- [column_name:field_type]"
      )

      expect(result.parsedComments).toHaveLength(4)
    })

    it("should handle complex SQL with mixed comments", () => {
      const sql = `
        -- This is a regular comment
        -- [id:number]
        -- [name:text]
        -- [is_active:checkbox]
        -- [created_at:datetime]
        
        SELECT 
          id,
          name,
          is_active,
          created_at
        FROM users
        WHERE is_active = true
      `

      const result = extractColumnTypeInfo(sql)

      expect(result.columnTypes).toEqual({
        id: FieldType.Number,
        name: FieldType.Text,
        is_active: FieldType.Checkbox,
        created_at: FieldType.DateTime,
      })

      expect(result.invalidComments).toHaveLength(0)
      expect(result.parsedComments).toHaveLength(5) // 4 valid + 1 regular comment
    })

    it("should handle inline comments in extractColumnTypeInfo", () => {
      const sql = `
        SELECT 
          id, -- [id:number]
          name, -- [name:text]
          email, -- [email:invalid_type]
          is_active -- [is_active:checkbox]
        FROM users
        WHERE is_active = true -- [status:select]
      `

      const result = extractColumnTypeInfo(sql)

      expect(result.columnTypes).toEqual({
        id: FieldType.Number,
        name: FieldType.Text,
        is_active: FieldType.Checkbox,
        status: FieldType.Select,
      })

      expect(result.invalidComments).toHaveLength(1)
      expect(result.invalidComments[0].reason).toBe(
        "Invalid field type: invalid_type"
      )
      expect(result.parsedComments).toHaveLength(5)
    })
  })

  describe("parseSearchableFieldsFromComments", () => {
    it("should parse searchable fields from @search comment", () => {
      const sql = `
        -- @search {title, description}
        SELECT title, description, url FROM bookmarks
      `
      const result = parseSearchableFieldsFromComments(sql)
      expect(result).toEqual(["title", "description"])
    })

    it("should handle single field", () => {
      const sql = `
        -- @search {title}
        SELECT * FROM table1
      `
      const result = parseSearchableFieldsFromComments(sql)
      expect(result).toEqual(["title"])
    })

    it("should handle multiple @search comments and merge fields", () => {
      const sql = `
        -- @search {title}
        -- @search {description, tags}
        SELECT * FROM table1
      `
      const result = parseSearchableFieldsFromComments(sql)
      expect(result).toEqual(["title", "description", "tags"])
    })

    it("should handle duplicate fields (deduplication)", () => {
      const sql = `
        -- @search {title, description}
        -- @search {title, content}
        SELECT * FROM table1
      `
      const result = parseSearchableFieldsFromComments(sql)
      expect(result).toEqual(["title", "description", "content"])
    })

    it("should handle spaces around field names", () => {
      const sql = `
        -- @search { title ,  description , url }
        SELECT * FROM table1
      `
      const result = parseSearchableFieldsFromComments(sql)
      expect(result).toEqual(["title", "description", "url"])
    })

    it("should be case insensitive for @search keyword", () => {
      const sql = `
        -- @SEARCH {title, description}
        -- @Search {content}
        SELECT * FROM table1
      `
      const result = parseSearchableFieldsFromComments(sql)
      expect(result).toEqual(["title", "description", "content"])
    })

    it("should return empty array when no @search comment", () => {
      const sql = `
        -- [title:text]
        SELECT * FROM table1
      `
      const result = parseSearchableFieldsFromComments(sql)
      expect(result).toEqual([])
    })

    it("should return empty array for empty @search comment", () => {
      const sql = `
        -- @search {}
        SELECT * FROM table1
      `
      const result = parseSearchableFieldsFromComments(sql)
      expect(result).toEqual([])
    })

    it("should handle inline @search comment", () => {
      const sql = `
        SELECT * FROM table1 -- @search {title, content}
      `
      const result = parseSearchableFieldsFromComments(sql)
      expect(result).toEqual(["title", "content"])
    })

    it("should handle complex SQL with both column types and searchable fields", () => {
      const sql = `
        -- [id:number]
        -- @search {title, description}
        -- [created_at:datetime]
        
        SELECT 
          id,
          title,
          description,
          created_at
        FROM articles
      `
      const columnTypes = parseColumnTypesFromComments(sql)
      const searchableFields = parseSearchableFieldsFromComments(sql)

      expect(columnTypes).toEqual({
        id: FieldType.Number,
        created_at: FieldType.DateTime,
      })
      expect(searchableFields).toEqual(["title", "description"])
    })
  })
})
