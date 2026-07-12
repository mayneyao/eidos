import { createRequire } from "node:module"
import type BetterSqlite3 from "better-sqlite3"
import type {
  Database as SqliteDatabase,
  Options as SqliteOptions,
} from "better-sqlite3"

// better-sqlite3 reads SQLITE_USE_URI when the native addon is loaded.
// Keep this before the runtime require so file:...?vfs=graft works on Windows.
process.env.SQLITE_USE_URI = "1"

const require = createRequire(import.meta.url)
const Database = require("better-sqlite3") as typeof BetterSqlite3

export type { SqliteDatabase, SqliteOptions }

export default Database
