import { expect, it } from "vitest"
import type {
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import {
  externalChangeAffectsEidosFile,
  fileMetadataAttachmentMatchesPath,
  fileMetadataRowPath,
  fileMetadataScopedView,
} from "./file-metadata-actions"

it.each([
  ["assets/files.eidos", "notes.md", "assets/notes.md", true],
  ["assets/files.eidos", "other.md", "assets/notes.md", false],
  ["assets/files.eidos", "my%20photo%23%25.jpg", "assets/my photo#%.jpg", true],
  ["assets/files.eidos", "%E7%9B%B8%E7%89%87.jpg", "assets/相片.jpg", true],
  [".eidos/files.eidos", "photos/a.png", "photos/a.png", true],
  ["files.eidos", "sub/a.png", "sub/a.png", true],
  ["files.eidos", "https://example.com/a.png", "a.png", false],
  ["files.eidos", "data:image/png;base64,AA==", "a.png", false],
  ["files.eidos", "../a.png", "a.png", false],
  ["files.eidos", "%2e%2e/a.png", "a.png", false],
  ["files.eidos", "sub%2fa.png", "sub/a.png", false],
  ["files.eidos", "bad%ZZ.png", "bad%ZZ.png", false],
] as const)(
  "compares file-cell URI %s / %s with mapped path %s",
  (metadata, uri, path, expected) => {
    expect(fileMetadataAttachmentMatchesPath(metadata, uri, path)).toBe(
      expected
    )
  }
)

const table = {
  table: { settings: { vtabModule: "fs_meta", vtabConfig: { root: "." } } },
  fields: [
    {
      id: "path-id",
      name: "path",
      tableColumnName: "path-id",
      settings: { isSystem: true },
    },
  ],
} as unknown as EidosFileTableSnapshot

it.each([
  ["assets/photo.jpg", true],
  ["assets/nested/renamed.txt", true],
  ["assets\\nested\\notes.txt", true],
  ["assets", true],
  ["assets-other/photo.jpg", false],
  ["other/photo.jpg", false],
])("refreshes metadata only within its scan scope: %s", (changed, expected) => {
  expect(
    externalChangeAffectsEidosFile("assets/files.eidos", [changed], {
      tables: [table],
    } as EidosFileSnapshot)
  ).toBe(expected)
})

it("resolves custom scan roots relative to the configuration", () => {
  const snapshot = {
    tables: [
      {
        ...table,
        table: {
          ...table.table,
          settings: {
            vtabModule: "fs_meta",
            vtabConfig: { root: "./photos" },
          },
        },
      },
    ],
  } as unknown as EidosFileSnapshot
  expect(
    externalChangeAffectsEidosFile(
      "assets/files.eidos",
      ["assets/photos/a.jpg"],
      snapshot
    )
  ).toBe(true)
  expect(
    externalChangeAffectsEidosFile(
      "assets/files.eidos",
      ["assets/notes.txt"],
      snapshot
    )
  ).toBe(false)
  expect(
    externalChangeAffectsEidosFile("assets/files.eidos", ["assets"], snapshot)
  ).toBe(true)
  expect(
    externalChangeAffectsEidosFile("assets/files.eidos", [], snapshot)
  ).toBe(true)
})

it("keeps ordinary tables independent of sibling files", () => {
  const snapshot = { tables: [] } as unknown as EidosFileSnapshot
  for (const changed of [
    "data.eidos",
    "data.eidos-wal",
    "data.eidos-shm",
    "data.eidos-journal",
    "",
  ]) {
    expect(
      externalChangeAffectsEidosFile("data.eidos", [changed], snapshot)
    ).toBe(true)
  }
  expect(
    externalChangeAffectsEidosFile("data.eidos", ["note.txt"], snapshot)
  ).toBe(false)
})
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

it("combines folder navigation with shared filters without changing the saved view", () => {
  const view = {
    id: "view",
    filter: { type: "rule", field: "rating", operator: "is", value: 5 },
  } as unknown as EidosFileViewInfo
  const before = JSON.stringify(view)
  const scoped = fileMetadataScopedView(table, view, "资料/图片")!
  expect(scoped.filter).toEqual({
    type: "group",
    conjunction: "and",
    children: [
      view.filter,
      {
        type: "rule",
        field: "path-id",
        operator: "greater-than-or-equal",
        value: "资料/图片/",
      },
      {
        type: "rule",
        field: "path-id",
        operator: "less-than",
        value: "资料/图片0",
      },
    ],
  })
  expect(JSON.stringify(view)).toBe(before)
  expect(fileMetadataScopedView(table, view, "")).toBe(view)
  expect(fileMetadataScopedView(table, view, undefined)).toBe(view)
  expect(() => fileMetadataScopedView(table, view, "../outside")).toThrow()
})

it("opens rows from the private catalog relative to the Space root", () => {
  const globalTable = {
    ...table,
    table: {
      ...table.table,
      settings: { vtabModule: "fs_meta", vtabConfig: { root: ".." } },
    },
  }
  expect(
    fileMetadataRowPath(
      globalTable,
      { "path-id": "assets/photo.png" },
      ".eidos/files.eidos"
    )
  ).toBe("assets/photo.png")
  expect(
    externalChangeAffectsEidosFile(".eidos/files.eidos", ["assets/photo.png"], {
      tables: [globalTable],
    } as unknown as EidosFileSnapshot)
  ).toBe(true)
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
