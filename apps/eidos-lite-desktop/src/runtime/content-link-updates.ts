import type { EidosRuntimeEditorDataSource } from "@eidos.space/eidos-file-ui/runtime-editor-data-source"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"
import type {
  ContentLinkSnapshot,
  ContentLinkUpdate,
  ContentLinkUpdateResult,
} from "../shared/content-link-updates"

const context = () => ({ requestId: "content-link-maintenance" })

function contentFields(snapshot: EidosFileSnapshot) {
  return snapshot.tables.flatMap(({ table, fields }) => {
    if (table.settings?.vtabModule) return []
    const field = fields.find(
      (field) =>
        field.id === table.contentFieldId &&
        field.type === "text" &&
        !field.systemRole &&
        !field.isDerived &&
        field.writable !== false
    )
    return field ? [{ tableId: table.id, fieldId: field.id }] : []
  })
}

/** Only declared Content, read and written by the canonical Runtime. */
export async function readContentLinkDocuments(
  source: EidosRuntimeEditorDataSource
): Promise<ContentLinkSnapshot> {
  const snapshot = await source.getSnapshot()
  const fields = contentFields(snapshot)
  const revision = String(snapshot.metadata.revision)
  const documents: ContentLinkSnapshot["documents"] = []
  for (const { tableId, fieldId } of fields) {
    let cursor: string | undefined
    do {
      const page = await source.runtime.queryRows(
        {
          tableId,
          query: {},
          projection: { fields: [fieldId], resolveRelations: [] },
          limit: 100,
          ...(cursor ? { cursor } : {}),
        },
        context()
      )
      if (page.revision !== revision)
        throw new Error("Content changed while preparing file links")
      for (const row of page.rows) {
        const content = row.values[0]
        if (typeof content === "string" && content)
          documents.push({ tableId, fieldId, rowId: row.id, content })
      }
      cursor = page.nextCursor ?? undefined
    } while (cursor)
  }
  if ((await source.runtime.getSnapshot({}, context())).revision !== revision)
    throw new Error("Content changed while preparing file links")
  return { revision, documents }
}

export async function writeContentLinkDocuments(
  source: EidosRuntimeEditorDataSource,
  update: ContentLinkUpdate
): Promise<ContentLinkUpdateResult> {
  const snapshot = await source.getSnapshot()
  const fields = contentFields(snapshot)
  let revision = update.revision
  if (String(snapshot.metadata.revision) !== revision)
    return { updated: false, skipped: true }
  const groups = new Map<string, ContentLinkUpdate["documents"]>()
  for (const document of update.documents) {
    if (
      !fields.some(
        (field) =>
          field.tableId === document.tableId &&
          field.fieldId === document.fieldId
      )
    )
      return { updated: false, skipped: true }
    const group = groups.get(document.tableId) ?? []
    group.push(document)
    groups.set(document.tableId, group)
  }
  let updated = false
  try {
    for (const [tableId, documents] of groups) {
      for (let at = 0; at < documents.length; at += 100) {
        const result = await source.runtime.mutateRows(
          {
            tableId,
            expectedRevision: revision,
            changes: documents
              .slice(at, at + 100)
              .map(({ rowId, fieldId, content }) => ({
                kind: "update",
                rowId,
                values: { [fieldId]: content },
              })),
          },
          context()
        )
        updated ||= result.changed
        revision = result.revision
      }
    }
    await source.getSnapshot()
    return { updated, skipped: false }
  } catch {
    return { updated, skipped: true }
  }
}
