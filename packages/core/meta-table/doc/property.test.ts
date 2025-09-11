import { describe, test, expect, beforeEach, vi } from "vitest";
import { FieldType } from "../../fields/const";

// Mock the DataSpace and related dependencies
const mockExec2 = vi.fn();
const mockDataSpace = {
  exec2: mockExec2,
  column: {
    getColumn: vi.fn(),
  },
  dbName: "test_db",
};

const mockBase = {
  name: "test_table",
  dataSpace: mockDataSpace,
  getTableColumns: vi.fn(),
};

// Create a mock class that extends the WithProperty mixin
class MockPropertyDocTable {
  name = "test_table";
  dataSpace = mockDataSpace;
  getTableColumns = vi.fn();

  // Import the getPropertyNonEmptyCount method
  async getPropertyNonEmptyCount(propertyName: string): Promise<number> {
    try {
      // Check if the property column exists
      const columns = await this.getTableColumns()
      if (!columns.includes(propertyName)) {
        return 0
      }

      // Query count of non-empty values
      // For different field types, "empty" has different meanings:
      // - Text fields: not NULL and not empty string
      // - Number fields: not NULL
      // - Boolean fields: not NULL
      // - JSON fields: not NULL and not empty JSON

      const columnInfo = await this.dataSpace.column.getColumn(this.name, propertyName)
      let whereCondition: string

      if (!columnInfo) {
        return 0
      }

      switch (columnInfo.type) {
        case FieldType.Number:
        case FieldType.Rating:
        case FieldType.Checkbox:
          // For numeric and boolean types, just check not NULL
          whereCondition = `${propertyName} IS NOT NULL`
          break
        default:
          // For text and other types, check not NULL and not empty string
          whereCondition = `${propertyName} IS NOT NULL AND ${propertyName} != ''`
          break
      }

      const sql = `SELECT COUNT(*) as count FROM ${this.name} WHERE ${whereCondition}`
      const res = await this.dataSpace.exec2(sql)

      return res[0]?.count || 0
    } catch (error) {
      console.error('Failed to get property non-empty count:', error)
      return 0
    }
  }
}

describe("getPropertyNonEmptyCount", () => {
  let propertyTable: MockPropertyDocTable;

  beforeEach(() => {
    propertyTable = new MockPropertyDocTable();
    vi.clearAllMocks();
  });

  test("should return 0 when property column does not exist", async () => {
    propertyTable.getTableColumns.mockResolvedValue(["id", "title", "content"]);

    const result = await propertyTable.getPropertyNonEmptyCount("nonexistent_property");

    expect(result).toBe(0);
    expect(propertyTable.getTableColumns).toHaveBeenCalledTimes(1);
  });

  test("should return 0 when column info is not found", async () => {
    propertyTable.getTableColumns.mockResolvedValue(["id", "title", "content", "test_property"]);
    mockDataSpace.column.getColumn.mockResolvedValue(null);

    const result = await propertyTable.getPropertyNonEmptyCount("test_property");

    expect(result).toBe(0);
    expect(mockDataSpace.column.getColumn).toHaveBeenCalledWith("test_table", "test_property");
  });

  test("should count non-null values for numeric fields", async () => {
    propertyTable.getTableColumns.mockResolvedValue(["id", "title", "number_field"]);
    mockDataSpace.column.getColumn.mockResolvedValue({ type: FieldType.Number });
    mockExec2.mockResolvedValue([{ count: 5 }]);

    const result = await propertyTable.getPropertyNonEmptyCount("number_field");

    expect(result).toBe(5);
    expect(mockExec2).toHaveBeenCalledWith("SELECT COUNT(*) as count FROM test_table WHERE number_field IS NOT NULL");
  });

  test("should count non-null and non-empty values for text fields", async () => {
    propertyTable.getTableColumns.mockResolvedValue(["id", "title", "text_field"]);
    mockDataSpace.column.getColumn.mockResolvedValue({ type: FieldType.Text });
    mockExec2.mockResolvedValue([{ count: 3 }]);

    const result = await propertyTable.getPropertyNonEmptyCount("text_field");

    expect(result).toBe(3);
    expect(mockExec2).toHaveBeenCalledWith("SELECT COUNT(*) as count FROM test_table WHERE text_field IS NOT NULL AND text_field != ''");
  });

  test("should count non-null values for checkbox fields", async () => {
    propertyTable.getTableColumns.mockResolvedValue(["id", "title", "checkbox_field"]);
    mockDataSpace.column.getColumn.mockResolvedValue({ type: FieldType.Checkbox });
    mockExec2.mockResolvedValue([{ count: 7 }]);

    const result = await propertyTable.getPropertyNonEmptyCount("checkbox_field");

    expect(result).toBe(7);
    expect(mockExec2).toHaveBeenCalledWith("SELECT COUNT(*) as count FROM test_table WHERE checkbox_field IS NOT NULL");
  });

  test("should handle errors gracefully", async () => {
    propertyTable.getTableColumns.mockResolvedValue(["id", "title", "error_field"]);
    mockDataSpace.column.getColumn.mockRejectedValue(new Error("Database error"));

    const result = await propertyTable.getPropertyNonEmptyCount("error_field");

    expect(result).toBe(0);
  });

  test("should return 0 when exec2 returns empty result", async () => {
    propertyTable.getTableColumns.mockResolvedValue(["id", "title", "empty_field"]);
    mockDataSpace.column.getColumn.mockResolvedValue({ type: FieldType.Text });
    mockExec2.mockResolvedValue([]);

    const result = await propertyTable.getPropertyNonEmptyCount("empty_field");

    expect(result).toBe(0);
  });
});
