import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SqlDataView } from './sql-data-view'
import type { DataSpace } from '../DataSpace'
import { FieldType } from '../fields/const'

// Mock DataSpace
const mockDataSpace = {
  db: {
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      all: vi.fn(),
    }),
    exec: vi.fn(),
  },
  view: {
    add: vi.fn(),
    deleteByTableId: vi.fn(),
  },
  column: {
    addPureUIColumn: vi.fn(),
    deleteByRawTableName: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
  },
  tree: {
    del: vi.fn(),
  },
} as unknown as DataSpace

describe('SqlDataView', () => {
  let sqlDataView: SqlDataView

  beforeEach(() => {
    vi.clearAllMocks()
    sqlDataView = new SqlDataView(mockDataSpace)
  })

  describe('createDataView', () => {
    it('should create view with column metadata from comments', async () => {
      const viewId = 'test-view-123'
      const createViewSql = `
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
      `

      // Mock getViewColumns to return the actual columns
      vi.spyOn(sqlDataView, 'getViewColumns').mockResolvedValue([
        { name: 'id', type: 'INTEGER' },
        { name: 'name', type: 'TEXT' },
        { name: 'is_active', type: 'BOOLEAN' },
        { name: 'created_at', type: 'TIMESTAMP' },
      ])

      await sqlDataView.createDataView(viewId, createViewSql)

      // Verify view creation
      expect(mockDataSpace.db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS vw_test-view-123')
      )

      // Verify column metadata creation
      expect(mockDataSpace.column.addPureUIColumn).toHaveBeenCalledWith({
        name: 'id',
        type: FieldType.Number,
        table_name: 'vw_test-view-123',
        table_column_name: 'id',
        property: expect.any(Object),
      })

      expect(mockDataSpace.column.addPureUIColumn).toHaveBeenCalledWith({
        name: 'name',
        type: FieldType.Text,
        table_name: 'vw_test-view-123',
        table_column_name: 'name',
        property: expect.any(Object),
      })

      expect(mockDataSpace.column.addPureUIColumn).toHaveBeenCalledWith({
        name: 'is_active',
        type: FieldType.Checkbox,
        table_name: 'vw_test-view-123',
        table_column_name: 'is_active',
        property: expect.any(Object),
      })

      expect(mockDataSpace.column.addPureUIColumn).toHaveBeenCalledWith({
        name: 'created_at',
        type: FieldType.DateTime,
        table_name: 'vw_test-view-123',
        table_column_name: 'created_at',
        property: expect.any(Object),
      })
    })

    it('should not create any column metadata when no comments are provided', async () => {
      const viewId = 'test-view-456'
      const createViewSql = `
        SELECT 
          id,
          name,
          email
        FROM users
      `

      await sqlDataView.createDataView(viewId, createViewSql)

      // Verify no column metadata is created when no comments are provided
      // System will default to text type for all columns
      expect(mockDataSpace.column.addPureUIColumn).not.toHaveBeenCalled()
    })

    it('should handle mixed comments and non-commented columns', async () => {
      const viewId = 'test-view-789'
      const createViewSql = `
        -- [id:number]
        -- [name:text]
        
        SELECT 
          id,
          name,
          email, -- [email:text]
          is_active -- [is_active:checkbox]
        FROM users
      `

      await sqlDataView.createDataView(viewId, createViewSql)

      // Verify only commented columns are created with metadata
      expect(mockDataSpace.column.addPureUIColumn).toHaveBeenCalledTimes(4)
      
      // Check specific column types
      const calls = (mockDataSpace.column.addPureUIColumn as any).mock.calls
      const columnTypes = calls.reduce((acc: Record<string, FieldType>, call: any[]) => {
        acc[call[0].name] = call[0].type
        return acc
      }, {} as Record<string, FieldType>)

      expect(columnTypes.id).toBe(FieldType.Number)
      expect(columnTypes.name).toBe(FieldType.Text)
      expect(columnTypes.email).toBe(FieldType.Text)
      expect(columnTypes.is_active).toBe(FieldType.Checkbox)
    })

    it('should not create column metadata for temporary views', async () => {
      const viewId = 'temp-view-123'
      const createViewSql = `
        -- [id:number]
        SELECT id FROM users
      `

      await sqlDataView.createDataView(viewId, createViewSql, true)

      // Verify view creation
      expect(mockDataSpace.db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TEMPORARY VIEW')
      )

      // Verify no column metadata is created for temp views
      expect(mockDataSpace.column.addPureUIColumn).not.toHaveBeenCalled()
    })
  })
})
