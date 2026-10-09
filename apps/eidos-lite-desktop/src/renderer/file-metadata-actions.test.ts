import { expect, it } from "vitest"
import type { EidosFileTableSnapshot } from "@eidos.space/eidos-file"
import { fileMetadataRowPath } from "./file-metadata-actions"

const table = {
  table: { settings: { vtabModule: "fs_meta", vtabConfig: { root: "." } } },
  fields: [
    { name: "path", tableColumnName: "path-id", settings: { isSystem: true } },
  ],
} as unknown as EidosFileTableSnapshot
it("opens files relative to their owning metadata folder", () => {
  expect(
    fileMetadataRowPath(table, { "path-id": "Notes/你好.md" }, "files.eidos")
  ).toBe("Notes/你好.md")
  expect(
    fileMetadataRowPath(
      table,
      { "path-id": "report.pdf" },
      "assets/files.eidos"
    )
  ).toBe("assets/report.pdf")
  expect(
    fileMetadataRowPath(table, { "path-id": "image.png" }, "assets/files.eidos")
  ).toBe("assets/image.png")
})
it.each([
  "../outside.md",
  "/private/note.md",
  "C:/notes.md",
  "notes\\outside.md",
  "bad\u0000.md",
])("rejects nonportable file paths %s", (path) => {
  expect(
    fileMetadataRowPath(table, { "path-id": path }, "files.eidos")
  ).toBeNull()
})
it("does not interpret an ordinary table's path column as a disk file", () => {
  expect(
    fileMetadataRowPath(
      { ...table, table: { ...table.table, settings: {} } },
      { "path-id": "note.md" },
      "files.eidos"
    )
  ).toBeNull()
})
