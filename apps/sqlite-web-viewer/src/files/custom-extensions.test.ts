import {
  addCustomSQLiteExtension,
  CUSTOM_SQLITE_EXTENSIONS_STORAGE_KEY,
  loadCustomSQLiteExtensions,
  normalizeCustomSQLiteExtension,
  sanitizeCustomSQLiteExtensions,
  saveCustomSQLiteExtensions,
} from "./custom-extensions"

describe("custom SQLite extensions", () => {
  it("normalizes suffixes and rejects path-like values", () => {
    expect(normalizeCustomSQLiteExtension(" ANKI2 ")).toBe(".anki2")
    expect(normalizeCustomSQLiteExtension(".my-format_2")).toBe(".my-format_2")
    expect(() => normalizeCustomSQLiteExtension("../database")).toThrow(
      /letters or numbers/
    )
  })

  it("adds unique custom suffixes without duplicating built-ins", () => {
    expect(addCustomSQLiteExtension([], "anki2")).toEqual([".anki2"])
    expect(() => addCustomSQLiteExtension([".anki2"], ".ANKI2")).toThrow(
      /already accepted/
    )
    expect(() => addCustomSQLiteExtension([], "db")).toThrow(/already accepted/)
  })

  it("sanitizes and persists a bounded extension list", () => {
    const storage = new Map<string, string>()
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    }
    expect(saveCustomSQLiteExtensions([".anki2", ".realm"], adapter)).toBe(true)
    expect(loadCustomSQLiteExtensions(adapter)).toEqual([".anki2", ".realm"])
    expect(storage.has(CUSTOM_SQLITE_EXTENSIONS_STORAGE_KEY)).toBe(true)
    expect(
      sanitizeCustomSQLiteExtensions([".DB", ".anki2", ".ANKI2", "bad/"])
    ).toEqual([".anki2"])
  })

  it("falls back safely when browser storage is unavailable", () => {
    const unavailable = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    expect(loadCustomSQLiteExtensions(unavailable)).toEqual([])
    expect(saveCustomSQLiteExtensions([".anki2"], unavailable)).toBe(false)
  })
})
