import { DatabaseSync } from "node:sqlite"
import path from "node:path"
import {
  initializeEidosFileSchema,
  createEidosFileUuid,
  canonicalizeEidosFileJson,
  ConnectionPortEidosFileConnection,
} from "@eidos.space/eidos-file"
import { NodeSqliteConnectionPort } from "@eidos.space/eidos-file/node-sqlite"
import { assertPortableFsMeta, resolveVTabExtensionPath } from "./vtab-resolver"

export interface FsMetaCustomField {
  name: string
  type: "text" | "integer" | "select" | "multi-select"
  settings?: Record<string, unknown>
}

export interface CreateFsMetaEidosFileOptions {
  title?: string
  tableName?: string
  root?: string
  namespace?: string
  customFields?: FsMetaCustomField[]
}

/**
 * Creates an .eidos file backed by the `fs_meta` virtual table.
 *
 * This file contains full Eidos File Format 1.0 metadata (`eidos__meta`, `eidos__tables`,
 * `eidos__fields`, `eidos__views`, `eidos__features`) so that Eidos Lite and
 * Eidos File UI can treat it as a standard table with Grid and Gallery views,
 * while all row data is queried from and persisted directly to filesystem extended attributes.
 */
export function createFsMetaEidosFile(
  filePath: string,
  options: CreateFsMetaEidosFileOptions = {}
): void {
  const title = options.title ?? "Files"
  const tableName = options.tableName ?? "files"
  const root =
    options.root === undefined
      ? "."
      : path.relative(
          path.dirname(path.resolve(filePath)),
          path.resolve(path.dirname(filePath), options.root)
        ) || "."
  const namespace = options.namespace ?? "space.eidos.meta"
  const customFields: FsMetaCustomField[] = options.customFields ?? [
    {
      name: "tags",
      type: "multi-select",
      settings: { options: [] },
    },
    {
      name: "rating",
      type: "integer",
      settings: {
        control: "rating",
        display: { kind: "rating", min: 0, max: 5 },
      },
    },
  ]

  const extPath = resolveVTabExtensionPath("fs_meta")
  if (!extPath) {
    throw new Error("Could not resolve sqlite-fs-meta extension (libfs_meta)")
  }

  const db = new DatabaseSync(filePath, { allowExtension: true })
  try {
    db.enableLoadExtension(true)
    db.loadExtension(extPath)
    db.enableLoadExtension(false)
    assertPortableFsMeta(db)

    // 1. Initialize Eidos File format schema
    initializeEidosFileSchema(
      new ConnectionPortEidosFileConnection(new NodeSqliteConnectionPort(db)),
      { title }
    )

    // 2. Feature registration
    const featureConfig = canonicalizeEidosFileJson({
      module: "fs_meta",
      root,
      namespace,
    })
    db.prepare(`
      INSERT INTO eidos__features (name, version, required, config_json)
      VALUES ('vtab:fs_meta', '1.0.0', 1, ?)
    `).run(featureConfig)

    // 3. Virtual table creation DDL
    const fieldsSql = JSON.stringify(
      customFields.map((f) => {
        const sqlType = f.type === "integer" ? "INTEGER" : "TEXT"
        return { name: f.name, type: sqlType, key: f.name }
      })
    )
    const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`
    db.exec(
      `CREATE VIRTUAL TABLE "${tableName.replaceAll('"', '""')}" USING fs_meta(root = ${sqlString(root)}, namespace = ${sqlString(namespace)}, fields = ${sqlString(fieldsSql)});`
    )

    // 4. Metadata registration (eidos__tables, eidos__fields, eidos__views)
    const tableId = createEidosFileUuid()
    const now = new Date().toISOString()

    const idFieldId = createEidosFileUuid()
    const nameFieldId = createEidosFileUuid()
    const pathFieldId = createEidosFileUuid()
    const extFieldId = createEidosFileUuid()
    const sizeFieldId = createEidosFileUuid()
    const mimetypeFieldId = createEidosFileUuid()
    const createdFieldId = createEidosFileUuid()
    const updatedFieldId = createEidosFileUuid()
    const fileFieldId = createEidosFileUuid()

    const customFieldIds = customFields.map(() => createEidosFileUuid())

    const tableViewId = createEidosFileUuid()
    const galleryViewId = createEidosFileUuid()

    db.exec("BEGIN;")

    const tableSettings = canonicalizeEidosFileJson({
      tableType: "virtual",
      vtabModule: "fs_meta",
      capabilities: {
        insert: false,
        delete: false,
        update: true,
        alterSchema: true,
      },
      vtabConfig: {
        root,
        namespace,
      },
    })

    db.prepare(`
      INSERT INTO eidos__tables (id, name, physical_name, label_field_id, position, settings_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(tableId, tableName, tableName, nameFieldId, tableSettings, now, now)

    const readOnlySystemSettings = canonicalizeEidosFileJson({
      isSystem: true,
      readOnly: true,
      writable: false,
    })

    const defaultExtensionOptions = [
      // Images
      { name: "png", color: "green" },
      { name: "jpg", color: "green" },
      { name: "jpeg", color: "green" },
      { name: "gif", color: "green" },
      { name: "svg", color: "purple" },
      { name: "webp", color: "green" },
      { name: "ico", color: "green" },
      // Documents & Text
      { name: "md", color: "blue" },
      { name: "markdown", color: "blue" },
      { name: "txt", color: "gray" },
      { name: "pdf", color: "red" },
      { name: "doc", color: "blue" },
      { name: "docx", color: "blue" },
      { name: "xls", color: "green" },
      { name: "xlsx", color: "green" },
      { name: "csv", color: "green" },
      // Code & Web
      { name: "js", color: "yellow" },
      { name: "ts", color: "blue" },
      { name: "jsx", color: "cyan" },
      { name: "tsx", color: "cyan" },
      { name: "json", color: "yellow" },
      { name: "html", color: "orange" },
      { name: "css", color: "purple" },
      { name: "py", color: "blue" },
      { name: "rs", color: "orange" },
      { name: "sql", color: "pink" },
      // Media
      { name: "mp3", color: "purple" },
      { name: "wav", color: "purple" },
      { name: "mp4", color: "orange" },
      { name: "mov", color: "orange" },
      // Archives
      { name: "zip", color: "brown" },
      { name: "tar", color: "brown" },
      { name: "gz", color: "brown" },
      // Eidos
      { name: "eidos", color: "blue" },
    ]

    const selectSystemSettings = canonicalizeEidosFileJson({
      isSystem: true,
      readOnly: true,
      writable: false,
      options: defaultExtensionOptions,
    })

    const standardFields: Array<
      [string, string, string, string, string | null, number, number, string]
    > = [
      [
        idFieldId,
        "_id",
        "_id",
        "text",
        "row-id",
        0,
        -4,
        readOnlySystemSettings,
      ],
      [
        createdFieldId,
        "_created_at",
        "_created_at",
        "datetime",
        "created-time",
        0,
        -3,
        readOnlySystemSettings,
      ],
      [
        updatedFieldId,
        "_updated_at",
        "_updated_at",
        "datetime",
        "updated-time",
        0,
        -2,
        readOnlySystemSettings,
      ],
      [nameFieldId, "name", "name", "text", null, 0, 0, readOnlySystemSettings],
      [pathFieldId, "path", "path", "text", null, 0, 1, readOnlySystemSettings],
      [
        extFieldId,
        "extension",
        "extension",
        "select",
        null,
        1,
        2,
        selectSystemSettings,
      ],
      [
        sizeFieldId,
        "size",
        "size",
        "integer",
        null,
        1,
        3,
        readOnlySystemSettings,
      ],
      [
        mimetypeFieldId,
        "mimetype",
        "mimetype",
        "text",
        null,
        1,
        4,
        readOnlySystemSettings,
      ],
      [fileFieldId, "file", "file", "file", null, 0, 5, readOnlySystemSettings],
    ]

    const allFields = [
      ...standardFields,
      ...customFields.map(
        (
          f,
          idx
        ): [
          string,
          string,
          string,
          string,
          string | null,
          number,
          number,
          string,
        ] => {
          const isNonNull = f.type === "multi-select"
          const defaultSettings =
            f.type === "multi-select" || f.type === "select"
              ? { options: [] }
              : f.name === "rating"
                ? {
                    control: "rating",
                    display: { kind: "rating", min: 0, max: 5 },
                  }
                : {}
          const settings = canonicalizeEidosFileJson({
            ...defaultSettings,
            ...(f.settings ?? {}),
          })
          return [
            customFieldIds[idx]!,
            f.name,
            f.name,
            f.type,
            null,
            isNonNull ? 0 : 1,
            6 + idx,
            settings,
          ]
        }
      ),
    ]

    for (const f of allFields) {
      db.prepare(`
        INSERT INTO eidos__fields (id, table_id, name, physical_name, type, system_role, nullable, position, settings_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(f[0], tableId, f[1], f[2], f[3], f[4], f[5], f[6], f[7], now, now)
    }

    db.prepare(`
      INSERT INTO eidos__views (id, table_id, name, type, position, created_at, updated_at)
      VALUES (?, ?, 'All Files', 'grid', 1, ?, ?)
    `).run(tableViewId, tableId, now, now)

    const galleryLayout = canonicalizeEidosFileJson({
      coverField: fileFieldId,
      coverFit: "cover",
    })

    db.prepare(`
      INSERT INTO eidos__views (id, table_id, name, type, layout_json, position, created_at, updated_at)
      VALUES (?, ?, 'Gallery', 'gallery', ?, 2, ?, ?)
    `).run(galleryViewId, tableId, galleryLayout, now, now)

    db.exec("COMMIT;")
  } finally {
    db.close()
  }
}
