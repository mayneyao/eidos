import fs from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import {
  decodeEidosFileValues,
  EidosFileRuntime,
  ConnectionPortEidosFileConnection,
} from "@eidos.space/eidos-file"
import { NodeSqliteConnectionPort } from "@eidos.space/eidos-file/node-sqlite"
import { createFsMetaEidosFile } from "./fs-meta-file"
import { openEidosLiteFileRuntime } from "./eidos-file-runtime"
import { resolveVTabExtensionPath } from "./vtab-resolver"
import { resolveEidosFileAttachment } from "../main/space/eidos-file-attachments"

describe("Eidos Lite fs_meta Virtual Table Integration", () => {
  const roots: string[] = []
  const runtimes: Awaited<ReturnType<typeof openEidosLiteFileRuntime>>[] = []
  afterEach(async () => {
    for (const runtime of runtimes.splice(0)) await runtime.close()
    for (const root of roots.splice(0))
      fs.rmSync(root, { recursive: true, force: true })
  })
  it("keeps storage keys and values stable across display-name changes", async () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(tmpdir(), "eidos-vtab-fields-"))
    )
    roots.push(root)
    fs.writeFileSync(path.join(root, "proof.txt"), "proof")
    const file = path.join(root, "files.eidos")
    createFsMetaEidosFile(file, { tableName: "Files (review)" })
    const runtime = await openEidosLiteFileRuntime(file)
    runtimes.push(runtime)
    const { table, fields } = runtime.initialSnapshot.tables[0]!
    const rating = fields.find((field) => field.name === "rating")!
    await runtime.source.updateRow(table.id, "proof.txt", { [rating.id!]: 4 })
    const renamed = await runtime.source.updateField(table.id, rating.id!, {
      name: "Owner's rating",
    })
    expect(
      renamed.tables[0]!.fields.find((field) => field.id === rating.id)
        ?.settings?.vtabStorageKey
    ).toBe("rating")
    expect(
      (await runtime.source.getRow(table.id, "proof.txt"))?.[rating.id!]
    ).toBe("4")
    for (const name of [
      "Review status",
      "Owner's notes",
      '备注 "类型", 分类',
    ]) {
      const snapshot = await runtime.source.addField(table.id, {
        name,
        type: "text",
      })
      const field = snapshot.tables[0]!.fields.find(
        (field) => field.name === name
      )!
      await runtime.source.updateRow(table.id, "proof.txt", {
        [field.id!]: "reviewed",
      })
      expect(
        (await runtime.source.getRow(table.id, "proof.txt"))?.[field.id!]
      ).toBe("reviewed")
    }
    await runtime.close()
    runtimes.splice(runtimes.indexOf(runtime), 1)
    const reopened = await openEidosLiteFileRuntime(file)
    runtimes.push(reopened)
    expect(
      (await reopened.source.getRow(table.id, "proof.txt"))?.[rating.id!]
    ).toBe("4")
  })

  it("restores exact external metadata on rollback and nested savepoints", () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(tmpdir(), "eidos-vtab-rollback-"))
    )
    roots.push(root)
    fs.writeFileSync(path.join(root, "proof.txt"), "proof")
    const file = path.join(root, "files.eidos")
    createFsMetaEidosFile(file)
    const db = new DatabaseSync(file, { allowExtension: true })
    try {
      db.loadExtension(resolveVTabExtensionPath("fs_meta")!)
      db.exec("UPDATE files SET rating=4 WHERE _id='proof.txt'")
      db.exec(
        "BEGIN; UPDATE files SET rating=1 WHERE _id='proof.txt'; ROLLBACK;"
      )
      expect(
        db.prepare("SELECT rating FROM files WHERE _id='proof.txt'").get()
          ?.rating
      ).toBe(4)
      db.exec(
        "BEGIN; UPDATE files SET rating=2 WHERE _id='proof.txt'; SAVEPOINT nested; UPDATE files SET rating=3 WHERE _id='proof.txt'; ROLLBACK TO nested; RELEASE nested; COMMIT;"
      )
      expect(
        db.prepare("SELECT rating FROM files WHERE _id='proof.txt'").get()
          ?.rating
      ).toBe(2)
      db.exec("BEGIN; UPDATE files SET rating=NULL WHERE _id='proof.txt';")
      expect(() => db.exec("DROP TABLE files")).toThrow()
      db.exec("ROLLBACK")
      expect(
        db.prepare("SELECT rating FROM files WHERE _id='proof.txt'").get()
          ?.rating
      ).toBe(2)
      const declaration = String(
        db.prepare("SELECT sql FROM sqlite_master WHERE name='files'").get()
          ?.sql
      )
      db.exec(
        `BEGIN; DROP TABLE files; ${declaration}; UPDATE files SET __fs_meta_remove_key='rating'; ROLLBACK;`
      )
      expect(
        db.prepare("SELECT rating FROM files WHERE _id='proof.txt'").get()
          ?.rating
      ).toBe(2)
      db.exec(
        "BEGIN; SAVEPOINT outermost; UPDATE files SET rating=5 WHERE _id='proof.txt'; RELEASE outermost; ROLLBACK;"
      )
      expect(
        db.prepare("SELECT rating FROM files WHERE _id='proof.txt'").get()
          ?.rating
      ).toBe(2)
      const core = new EidosFileRuntime(
        new ConnectionPortEidosFileConnection(new NodeSqliteConnectionPort(db))
      )
      const table = core.listTables()[0]!
      const rating = core
        .listFields(table.id)
        .find((field) => field.name === "rating")!
      const tags = core
        .listFields(table.id)
        .find((field) => field.name === "tags")!
      expect(() =>
        core.applyCanonicalMutation(() => {
          core.deleteField(table.id, rating.id!)
          core.deleteField(table.id, tags.id!)
          throw new Error("abort schema batch")
        })
      ).toThrow("abort schema batch")
      expect(
        db.prepare("SELECT rating FROM files WHERE _id='proof.txt'").get()
          ?.rating
      ).toBe(2)
      core.applyCanonicalMutation(() => {
        core.deleteField(table.id, rating.id!)
        core.deleteField(table.id, tags.id!)
      })
      expect(
        core
          .listFields(table.id)
          .some((field) => field.id === rating.id || field.id === tags.id)
      ).toBe(false)
    } finally {
      db.close()
    }
  })

  it("resolves gallery attachments relative to the database for nested roots", async () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(tmpdir(), "eidos-vtab-assets-"))
    )
    roots.push(root)
    const folder = "O'Brien photos"
    fs.mkdirSync(path.join(root, folder))
    fs.writeFileSync(path.join(root, folder, "proof.txt"), "proof")
    const file = path.join(root, "files.eidos")
    createFsMetaEidosFile(file, { root: folder })
    const runtime = await openEidosLiteFileRuntime(file)
    runtimes.push(runtime)
    const { table, fields } = runtime.initialSnapshot.tables[0]!
    const field = fields.find((field) => field.name === "file")!
    const row = await runtime.source.getRow(table.id, "proof.txt")
    const entry = decodeEidosFileValues(row![field.id!] as string)[0]!
    expect(decodeURIComponent(entry.uri)).toBe(`${folder}/proof.txt`)
    await expect(
      resolveEidosFileAttachment(root, "files.eidos", entry, "preview")
    ).resolves.toBeDefined()
  })
  it.each([".", 'O\'Brien "资料"'])(
    "keeps metadata readable and writable after moving a folder (root %s)",
    async (relativeRoot) => {
      const base = fs.mkdtempSync(path.join(tmpdir(), "eidos-portable-vtab-"))
      roots.push(base)
      const original = path.join(base, "original's folder")
      const scanRoot = path.join(original, relativeRoot)
      fs.mkdirSync(scanRoot, { recursive: true })
      fs.writeFileSync(path.join(scanRoot, "proof.txt"), "proof")
      const file = path.join(original, "files.eidos")
      createFsMetaEidosFile(file, { root: relativeRoot })
      const db = new DatabaseSync(file)
      const feature = db
        .prepare(
          "SELECT config_json FROM eidos__features WHERE name='vtab:fs_meta'"
        )
        .get()
      expect(JSON.parse(String(feature?.config_json)).root).toBe(relativeRoot)
      db.close()
      const moved = path.join(base, "moved")
      fs.renameSync(original, moved)
      // Leave a different file at the old path to detect an accidental stale binding.
      fs.mkdirSync(scanRoot, { recursive: true })
      fs.writeFileSync(path.join(scanRoot, "stale.txt"), "stale")
      const runtime = await openEidosLiteFileRuntime(
        path.join(moved, "files.eidos")
      )
      runtimes.push(runtime)
      const table = runtime.initialSnapshot.tables[0]!
      const rating = table.fields.find((field) => field.name === "rating")!
      expect(
        await runtime.source.getRow(table.table.id, "proof.txt")
      ).not.toBeNull()
      expect(
        await runtime.source.getRow(table.table.id, "stale.txt")
      ).toBeNull()
      await runtime.source.updateRow(table.table.id, "proof.txt", {
        [rating.id!]: 4,
      })
      expect(
        (await runtime.source.getRow(table.table.id, "proof.txt"))?.[rating.id!]
      ).toBe("4")
    }
  )
  it("creates and opens virtual table files.eidos and performs queries and metadata updates", async () => {
    const testDir = fs.mkdtempSync(path.join(tmpdir(), "eidos-vtab-test-"))
    roots.push(testDir)

    // Create sample files in testDir to verify scanning
    fs.writeFileSync(path.join(testDir, "hello.txt"), "Hello, world!")
    fs.writeFileSync(path.join(testDir, "photo.png"), "Fake image data")
    fs.writeFileSync(path.join(testDir, "notes.md"), "# Some notes")

    const eidosFilePath = path.join(testDir, "files.eidos")

    // 1. Create files.eidos using createFsMetaEidosFile helper with default fields
    createFsMetaEidosFile(eidosFilePath, {
      title: "Files",
      tableName: "files",
      root: testDir,
    })

    // 2. Open via openEidosLiteFileRuntime
    const runtime = await openEidosLiteFileRuntime(eidosFilePath)
    runtimes.push(runtime)
    expect(runtime).toBeDefined()

    const snapshot = await runtime.source.getSnapshot()
    expect(snapshot.tables).toHaveLength(1)
    const tableSnapshot = snapshot.tables[0]
    expect(tableSnapshot.table.name).toBe("files")
    expect(tableSnapshot.table.settings?.tableType).toBe("virtual")

    const tableId = tableSnapshot.table.id
    const fields = tableSnapshot.fields
    const nameField = fields.find((f) => f.name === "name")!
    const pathField = fields.find((f) => f.name === "path")!
    const extField = fields.find((f) => f.name === "extension")!
    const sizeField = fields.find((f) => f.name === "size")!
    const fileField = fields.find((f) => f.name === "file")!
    const mimetypeField = fields.find((f) => f.name === "mimetype")!
    const tagsField = fields.find((f) => f.name === "tags")!
    const ratingField = fields.find((f) => f.name === "rating")!

    expect(nameField).toBeDefined()
    expect(nameField.type).toBe("text")
    expect(nameField.writable).toBe(false)

    expect(pathField).toBeDefined()
    expect(pathField.type).toBe("text")
    expect(pathField.writable).toBe(false)

    expect(extField).toBeDefined()
    expect(extField.type).toBe("select")
    expect(extField.writable).toBe(false)
    const extOptions = (extField.property?.options ?? []) as Array<{
      name: string
      color: string
    }>
    expect(
      extOptions.some((opt) => opt.name === "png" && opt.color === "green")
    ).toBe(true)

    // Update extension options (change png color to blue)
    const updatedSnapshot = await runtime.source.updateField(
      tableId,
      extField.id,
      {
        property: {
          options: extOptions.map((opt) =>
            opt.name === "png" ? { ...opt, color: "blue" } : opt
          ),
        },
      }
    )
    const updatedExtField = updatedSnapshot.tables[0].fields.find(
      (f) => f.id === extField.id
    )!
    expect(updatedExtField.writable).toBe(false)
    const updatedExtOptions = (updatedExtField.property?.options ??
      []) as Array<{
      name: string
      color: string
    }>
    expect(
      updatedExtOptions.some(
        (opt) => opt.name === "png" && opt.color === "blue"
      )
    ).toBe(true)

    expect(sizeField).toBeDefined()
    expect(sizeField.writable).toBe(false)

    expect(mimetypeField).toBeDefined()
    expect(mimetypeField.type).toBe("text")
    expect(mimetypeField.writable).toBe(false)

    expect(fileField).toBeDefined()
    expect(fileField.type).toBe("file")
    expect(fileField.writable).toBe(false)

    expect(tagsField).toBeDefined()
    expect(tagsField.type).toBe("multi-select")
    expect(tagsField.writable).toBe(true)

    expect(ratingField).toBeDefined()
    expect(ratingField.type).toBe("rating")
    expect(ratingField.writable).toBe(true)

    const galleryView = tableSnapshot.views.find((v) => v.type === "gallery")!
    expect(galleryView).toBeDefined()
    expect(galleryView.properties?.coverField).toBe(fileField.id)

    // 3. Query rows
    const page = await runtime.source.getPage(tableId, 0, 10, {})
    expect(page.rows.length).toBeGreaterThanOrEqual(4)

    const photoRow = page.rows.find((r) => r[nameField.id] === "photo.png")!
    expect(photoRow).toBeDefined()
    expect(photoRow[pathField.id]).toBe("photo.png")
    expect(photoRow[extField.id]).toBe("png")
    expect(photoRow[mimetypeField.id]).toBe("image/png")

    const helloRow = page.rows.find((r) => r[nameField.id] === "hello.txt")!
    expect(helloRow).toBeDefined()
    expect(helloRow[mimetypeField.id]).toBe("text/plain")

    // 3b. Verify filtering by mimetype with starts-with
    const imagePage = await runtime.source.getPage(tableId, 0, 10, {
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: mimetypeField.id,
            operator: "starts-with",
            value: "image/",
          },
        ],
      },
    })
    expect(imagePage.rows).toHaveLength(1)
    expect(imagePage.rows[0][nameField.id]).toBe("photo.png")

    const rawFileJson = photoRow[fileField.id] as string
    expect(typeof rawFileJson).toBe("string")
    const fileEntries = decodeEidosFileValues(rawFileJson)
    expect(Array.isArray(fileEntries)).toBe(true)
    expect(fileEntries).toHaveLength(1)
    const entry = fileEntries[0]!
    expect(entry.name).toBe("photo.png")
    expect(entry.mediaType).toBe("image/png")
    expect(entry.size).toBe(
      String(fs.statSync(path.join(testDir, "photo.png")).size)
    )
    expect(entry.uri).toBe("photo.png")
    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )

    // 3c. Verify runtime.findFileEntry resolves this attachment ID
    const foundEntry = runtime.findFileEntry(entry.id)
    expect(foundEntry).toEqual(entry)

    // 4. Update custom tags and rating columns on hello.txt
    const updateResult = await runtime.source.updateRow(tableId, "hello.txt", {
      [tagsField.id]: ["work", "notes"],
      [ratingField.id]: 5,
    })
    expect(updateResult.row._id).toBe("hello.txt")
    expect(updateResult.row[tagsField.id]).toBe(
      JSON.stringify(["work", "notes"])
    )
    expect(updateResult.row[ratingField.id]).toBe("5")

    // 5. Retrieve updated row directly
    const rowAfter = await runtime.source.getRow(tableId, "hello.txt")
    expect(rowAfter?.[tagsField.id]).toBe(JSON.stringify(["work", "notes"]))
    expect(rowAfter?.[ratingField.id]).toBe("5")

    // 6. Verify read-only field update rejections
    await expect(
      runtime.source.updateRow(tableId, "hello.txt", {
        [nameField.id]: "renamed.txt",
      })
    ).rejects.toThrow()

    await expect(
      runtime.source.updateRow(tableId, "hello.txt", {
        [pathField.id]: "other/path.txt",
      })
    ).rejects.toThrow()

    await expect(
      runtime.source.updateRow(tableId, "hello.txt", {
        [sizeField.id]: 999,
      })
    ).rejects.toThrow()

    await expect(
      runtime.source.updateRow(tableId, "hello.txt", {
        [mimetypeField.id]: "image/jpeg",
      })
    ).rejects.toThrow()

    // 7. Verify insert rejection
    await expect(
      runtime.source.insertRow(tableId, { [nameField.id]: "invalid.txt" })
    ).rejects.toThrow()

    // 7b. Dynamically add custom field 'type' (Select with options)
    const typeFieldSnapshot = await runtime.source.addField(tableId, {
      name: "type",
      type: "select",
      property: {
        options: [
          { name: "图片", color: "gray" },
          { name: "文档", color: "blue" },
          { name: "eidos 表格", color: "yellow" },
          { name: "其他", color: "pink" },
        ],
      },
    })
    const typeField = typeFieldSnapshot.tables[0].fields.find(
      (f) => f.name === "type"
    )!
    expect(typeField).toBeDefined()
    expect(typeField.type).toBe("select")
    expect(typeField.writable).toBe(true)

    // Update row with newly created 'type' field
    const typeUpdateResult = await runtime.source.updateRow(
      tableId,
      "hello.txt",
      {
        [typeField.id]: "文档",
      }
    )
    expect(typeUpdateResult.row[typeField.id]).toBe("文档")

    // Retrieve row directly
    const rowWithType = await runtime.source.getRow(tableId, "hello.txt")
    expect(rowWithType?.[typeField.id]).toBe("文档")

    // Rename custom field 'type' to 'category'
    const renameSnapshot = await runtime.source.updateField(
      tableId,
      typeField.id,
      {
        name: "category",
      }
    )
    const categoryField = renameSnapshot.tables[0].fields.find(
      (f) => f.id === typeField.id
    )!
    expect(categoryField.name).toBe("category")

    // Row still has value under the field ID
    const rowWithCategory = await runtime.source.getRow(tableId, "hello.txt")
    expect(rowWithCategory?.[categoryField.id]).toBe("文档")

    // Delete custom field 'category'
    const deleteSnapshot = await runtime.source.deleteField(
      tableId,
      categoryField.id
    )
    expect(
      deleteSnapshot.tables[0].fields.some((f) => f.id === categoryField.id)
    ).toBe(false)

    await runtime.close()
    runtimes.splice(runtimes.indexOf(runtime), 1)

    // 8. Verify OS-level extended attributes were written to disk
    if (process.platform === "darwin") {
      const xattr = execFileSync(
        "xattr",
        ["-p", "space.eidos.meta", path.join(testDir, "hello.txt")],
        { encoding: "utf8" }
      )
      expect(JSON.parse(xattr)).toEqual({
        tags: ["work", "notes"],
        rating: 5,
      })
    }
  })
})
