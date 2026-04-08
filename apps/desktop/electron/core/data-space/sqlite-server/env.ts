// Set SQLite environment variables BEFORE loading better-sqlite3
// This must be imported before any other imports that load better-sqlite3
// See: https://github.com/WiseLibs/better-sqlite3/issues/483

// Enable URI format support for SQLite
// This allows using URIs like "file:mydb.db?cache=shared"
process.env.SQLITE_USE_URI = "1"
