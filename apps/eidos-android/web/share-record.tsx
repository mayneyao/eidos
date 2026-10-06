import { mobileText } from "../../../packages/mobile-plugin-host/src/locale"
import { useEffect, useRef, useState } from "react"
import type {
  EidosFileRow,
  EidosFileSnapshot,
  FileEntry,
} from "@eidos.space/eidos-file"
import type { EidosRuntimeEditorDataSource } from "@eidos.space/eidos-file-ui"
import { EidosFileRecordInspector } from "@eidos.space/eidos-file-ui/eidos-file-record-inspector"
import { searchEidosFileRelationRecords } from "@eidos.space/eidos-file-ui/eidos-file-relation-search"
import { handleMobileBack } from "@eidos.space/eidos-file-ui/mobile-back"
import { drainRequests, type BridgeRequest } from "./bridge"

type ShareForm = {
  table: string
  revision: string
  changes: Record<string, unknown>
  attachmentField: string | null
  pendingFileCount: number
}

export function ShareRecordEditor({
  source,
  initialSnapshot,
  request,
  importFiles,
}: {
  source: EidosRuntimeEditorDataSource
  initialSnapshot: EidosFileSnapshot
  request: BridgeRequest
  importFiles: (options?: { imagesOnly?: boolean }) => Promise<FileEntry[]>
}) {
  const [form, setForm] = useState<ShareForm | null>(null)
  const current = useRef<ShareForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const report = (error: unknown) =>
    setError(error instanceof Error ? error.message : String(error))
  const finish = async () => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    await drainRequests()
  }
  useEffect(() => {
    let active = true
    void request<ShareForm>("share.init")
      .then((value) => {
        if (active) {
          current.current = value
          setForm(value)
        }
      })
      .catch(report)
    window.eidosFlush = finish
    window.eidosLeave = () => {
      if (handleMobileBack()) return
      void finish()
        .then(() => request("leave"))
        .catch(report)
    }
    return () => {
      active = false
      delete window.eidosFlush
    }
  }, [request])
  const table = initialSnapshot.tables.find((t) => t.table.id === form?.table)
  const row: EidosFileRow = { _id: "share-draft" }
  if (form && table)
    for (const field of table.fields) {
      if (Object.hasOwn(form.changes, field.id))
        row[field.tableColumnName] = form.changes[
          field.id
        ] as EidosFileRow[string]
    }
  return (
    <section className="share-record">
      <header className="flex items-center justify-between gap-4 px-5 py-3">
        <strong>{mobileText("保存分享记录")}</strong>
        <button
          disabled={busy || !table}
          onClick={async () => {
            setBusy(true)
            setError("")
            try {
              await finish()
              await request("share.save", current.current!)
            } catch (error) {
              report(error)
            } finally {
              setBusy(false)
            }
          }}
        >
          {mobileText("保存记录")}
        </button>
      </header>
      {error && (
        <p role="alert" className="px-5 text-destructive">
          {error}
        </p>
      )}
      {form && table && (
        <>
          {form.pendingFileCount > 0 && (
            <label className="flex items-center gap-3 px-5 py-3">
              {form.pendingFileCount}
              {mobileText(" 个分享附件保存到")}
              <select
                value={form.attachmentField ?? ""}
                disabled={busy}
                onChange={async (e) => {
                  const fieldId = e.target.value
                  try {
                    await request("share.attachmentField", { fieldId })
                    const next = {
                      ...current.current!,
                      attachmentField: fieldId,
                    }
                    current.current = next
                    setForm(next)
                  } catch (error) {
                    report(error)
                  }
                }}
              >
                {table.fields
                  .filter(
                    (f) =>
                      f.type === "file" && !f.isDerived && f.writable !== false
                  )
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <EidosFileRecordInspector
            variant="page"
            row={row}
            fields={table.fields.filter((f) => !f.systemRole)}
            contentField={table.fields.find(
              (f) => f.id === table.table.contentFieldId
            )}
            disabled={busy}
            onCellEdit={async (row, field, value) => {
              const next = {
                ...current.current!,
                changes: { ...current.current!.changes, [field.id]: value },
              }
              await request("share.draft", next)
              current.current = next
              setForm(next)
              return {
                tableId: table.table.id,
                row: { ...row, [field.tableColumnName]: value },
                rowCount: table.rowCount,
              }
            }}
            onSearchRelation={(field, query) =>
              searchEidosFileRelationRecords(source, field, query)
            }
            onImportFiles={importFiles}
            onError={report}
          />
        </>
      )}
    </section>
  )
}
