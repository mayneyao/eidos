import { createRequire } from "node:module"

// better-sqlite3 reads SQLITE_USE_URI when the native addon is loaded.
// Keep this before the runtime require so file:...?vfs=graft works on Windows.
process.env.SQLITE_USE_URI = "1"

const require = createRequire(import.meta.url)
const Database = require("better-sqlite3") as typeof import("better-sqlite3")

export type SqliteDatabase = import("better-sqlite3").Database
export type SqliteOptions = import("better-sqlite3").Options

export default Database
