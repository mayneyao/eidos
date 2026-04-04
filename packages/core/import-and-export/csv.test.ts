import { describe, it, expect, beforeEach, vi } from "vitest"
import { CsvImportAndExport } from "./csv"
import type { DataSpace } from "../data-space"

vi.mock("../sdk/table", () => {
  return {
    TableManager: vi.fn().mockImplementation(() => ({
      rows: {
        getFieldMap: vi.fn().mockResolvedValue({
          fieldRawColumnNameFieldMap: {},
          fieldNameRawColumnNameMap: {},
        }),
        batchSyncCreate: vi.fn().mockReturnValue([]),
      },
    })),
  }
})

function createMockDataSpace(): DataSpace {
  return {
    blockUIMsg: vi.fn(),
    notify: vi.fn(),
    createTableViaSchema: vi.fn().mockResolvedValue(undefined),
    db: {
      exec: vi.fn().mockResolvedValue(undefined),
      prepare: vi.fn().mockReturnValue({ run: vi.fn() }),
      isWalMode: true,
    },
    column: {
      list: vi.fn().mockResolvedValue([]),
    },
  } as unknown as DataSpace
}

describe("CsvImportAndExport", () => {
  let importer: CsvImportAndExport
  let mockDataSpace: DataSpace

  beforeEach(() => {
    vi.clearAllMocks()
    importer = new CsvImportAndExport({ useWal: true })
    mockDataSpace = createMockDataSpace()
  })

  it("imports a valid CSV successfully", async () => {
    const csv = "Name,Age\nAlice,30\nBob,25"
    const tableId = await importer.import(
      { name: "test.csv", content: csv },
      mockDataSpace
    )
    expect(tableId).toBeDefined()
    expect(tableId).toHaveLength(32)
    expect(mockDataSpace.createTableViaSchema).toHaveBeenCalled()
    expect(mockDataSpace.blockUIMsg).toHaveBeenLastCalledWith(null)
  })

  it("throws friendly error for empty CSV", async () => {
    await expect(
      importer.import({ name: "empty.csv", content: "   " }, mockDataSpace)
    ).rejects.toThrow("CSV file is empty")
  })

  it("throws friendly error for CSV with unclosed quote in header", async () => {
    const csv = '"Name,Age\nAlice,30'
    await expect(
      importer.import({ name: "bad.csv", content: csv }, mockDataSpace)
    ).rejects.toThrow(/unclosed quote/i)
  })

  it("imports CSV with quotes inside fields using relax_quotes", async () => {
    const csv = 'Name,Age\nAlice "The Queen",30\nBob,25'
    const tableId = await importer.import(
      { name: "quotes.csv", content: csv },
      mockDataSpace
    )
    expect(tableId).toBeDefined()
  })

  it("skips malformed rows and imports good rows", async () => {
    const csv = 'Name,Age\n"Alice,30\nBob,25'
    const tableId = await importer.import(
      { name: "partial.csv", content: csv },
      mockDataSpace
    )
    expect(tableId).toBeDefined()
    expect(mockDataSpace.notify).toHaveBeenCalledWith(
      expect.stringMatching(/skipped/i)
    )
  })

  it("handles CSV with BOM", async () => {
    const csv = "\ufeffName,Age\nAlice,30"
    const tableId = await importer.import(
      { name: "bom.csv", content: csv },
      mockDataSpace
    )
    expect(tableId).toBeDefined()
  })

  it("creates table successfully even with only header and no data rows", async () => {
    const csv = "Name,Age"
    const tableId = await importer.import(
      { name: "header-only.csv", content: csv },
      mockDataSpace
    )
    expect(tableId).toBeDefined()
    expect(mockDataSpace.createTableViaSchema).toHaveBeenCalled()
  })
})
