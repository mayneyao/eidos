import { copyFile, mkdir, rm } from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

const fixturesDirectory = fileURLToPath(
  new URL("../fixtures/", import.meta.url)
)
const databasePath = fileURLToPath(
  new URL("../fixtures/sqlite-viewer-fixture.sqlite", import.meta.url)
)
const eidosPath = fileURLToPath(
  new URL("../fixtures/sqlite-viewer-fixture.eidos", import.meta.url)
)
const emptyPath = fileURLToPath(
  new URL("../fixtures/empty.sqlite", import.meta.url)
)

await mkdir(fixturesDirectory, { recursive: true })
await Promise.all([
  rm(databasePath, { force: true }),
  rm(eidosPath, { force: true }),
  rm(emptyPath, { force: true }),
])

const database = new DatabaseSync(databasePath)
database.exec("PRAGMA foreign_keys = ON")
database.exec("PRAGMA application_id = 1162103123")
database.exec("PRAGMA user_version = 7")
database.exec(`
  CREATE TABLE authors (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    portrait BLOB,
    note TEXT
  ) WITHOUT ROWID;

  CREATE TABLE entries (
    id INTEGER PRIMARY KEY,
    author_code TEXT NOT NULL,
    title TEXT NOT NULL,
    score REAL,
    notes TEXT,
    payload BLOB,
    optional_value TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_code) REFERENCES authors(code)
      ON UPDATE CASCADE ON DELETE RESTRICT
  );

  CREATE INDEX entries_author_score_idx
    ON entries(author_code, score DESC)
    WHERE score IS NOT NULL;

  CREATE VIEW entry_summary AS
    SELECT entries.id, entries.title, authors.name AS author, entries.score
    FROM entries
    JOIN authors ON authors.code = entries.author_code;
`)

const insertAuthor = database.prepare(
  "INSERT INTO authors(code, name, portrait, note) VALUES (?, ?, ?, ?)"
)
insertAuthor.run(
  "ada",
  "Ada Lovelace",
  Buffer.from([0, 1, 2, 3, 254, 255]),
  null
)
insertAuthor.run("grace", "Grace Hopper", null, "Compiler pioneer")

const insertEntry = database.prepare(`
  INSERT INTO entries(
    author_code, title, score, notes, payload, optional_value, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`)
insertEntry.run(
  "ada",
  "Analytical Engine notes",
  9.75,
  "A".repeat(3_200),
  Buffer.from(Array.from({ length: 96 }, (_, index) => index)),
  null,
  "1843-01-01T00:00:00Z"
)
insertEntry.run(
  "grace",
  "The education of a computer",
  8.5,
  "Readable programs matter.",
  Buffer.from([222, 173, 190, 239]),
  "present",
  "1952-01-01T00:00:00Z"
)
database.exec("BEGIN")
try {
  for (let index = 3; index <= 620; index += 1) {
    insertEntry.run(
      index % 2 === 0 ? "grace" : "ada",
      `Reference row ${index.toString().padStart(4, "0")}`,
      index % 7 === 0 ? null : (index % 100) / 10,
      index % 11 === 0 ? `Windowed paging fixture ${index}` : null,
      null,
      null,
      `2024-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`
    )
  }
  database.exec("COMMIT")
} catch (error) {
  database.exec("ROLLBACK")
  throw error
}
database.close()

const emptyDatabase = new DatabaseSync(emptyPath)
emptyDatabase.exec("PRAGMA user_version = 1")
emptyDatabase.close()

await copyFile(databasePath, eidosPath)
