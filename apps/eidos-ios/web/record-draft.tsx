import { mobileText } from "../../../packages/mobile-plugin-host/src/locale"
import { useRef, useState } from "react"
import type {
  EidosFileRow,
  EidosFileTableSnapshot,
  FileEntry,
} from "@eidos.space/eidos-file"
import type { EidosRuntimeEditorDataSource } from "@eidos.space/eidos-file-ui"
import { EidosFileRecordInspector } from "@eidos.space/eidos-file-ui/eidos-file-record-inspector"
import { searchEidosFileRelationRecords } from "@eidos.space/eidos-file-ui/eidos-file-relation-search"
import { request, drainRequests } from "./bridge"

export type RecordDraft = {
  tableId: string
  row: EidosFileRow
  submitting?: boolean
  submitted?: boolean
}
export type SharedContent = { id: string; text: string; files: string[] }

export function RecordDraftEditor({
  source,
  tables,
  initial,
  share,
  importFiles,
  onDone,
}: {
  source: EidosRuntimeEditorDataSource
  tables: EidosFileTableSnapshot[]
  initial: RecordDraft | null
  share?: SharedContent
  importFiles: (options?: { imagesOnly?: boolean }) => Promise<FileEntry[]>
  onDone: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const current = useRef(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [discarding, setDiscarding] = useState(false)
  const table = tables.find((t) => t.table.id === draft?.tableId)
  const save = async (next: RecordDraft) => {
    await request("recordDraft.save", next)
    current.current = next
    setDraft(next)
  }
  const perform = async (action: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const choose = (target: EidosFileTableSnapshot) =>
    perform(async () => {
      const writable = target.fields.filter(
        (f) => !f.isDerived && !f.systemRole && f.writable !== false
      )
      const text =
        writable.find((f) => f.isRecordLabel && f.type === "text") ??
        writable.find((f) => f.type === "text" || f.type === "url")
      const attachment = writable.find((f) => f.type === "file")
      if (share?.text && !text)
        throw new Error(mobileText("这张表没有可写入分享文本的字段"))
      if (share?.files.length && !attachment)
        throw new Error(mobileText("这张表没有附件字段，请选择其他表或文件夹"))
      const row: EidosFileRow = { _id: "draft" }
      if (text && share?.text) row[text.tableColumnName] = share.text
      if (attachment && share?.files.length)
        row[attachment.tableColumnName] = JSON.stringify(
          await request<FileEntry[]>("share.import")
        )
      await save({ tableId: target.table.id, row })
    })
  const complete = async () => {
    await request(share ? "share.complete" : "recordDraft.remove")
    onDone()
  }
  const submit = () =>
    perform(async () => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur()
      await drainRequests()
      const value = current.current
      if (!value || !table || value.submitting || value.submitted) return
      await save({ ...value, submitting: true })
      const values = Object.fromEntries(
        table.fields
          .filter(
            (f) =>
              !f.systemRole &&
              !f.isDerived &&
              f.writable !== false &&
              Object.hasOwn(value.row, f.tableColumnName)
          )
          .map((f) => [f.id, value.row[f.tableColumnName]])
      )
      await source.insertRow(table.table.id, values)
      await save({ ...value, submitting: false, submitted: true })
      await complete()
    })
  return (
    <section className="record-draft">
      <header>
        <strong>
          {share ? mobileText("保存分享记录") : mobileText("新记录")}
        </strong>
        <button disabled={busy} onClick={onDone}>
          {mobileText("稍后继续")}
        </button>
        {table && !draft?.submitting && !draft?.submitted && (
          <button disabled={busy} onClick={submit}>
            {mobileText("保存记录")}
          </button>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
      {draft?.submitted ? (
        <p>
          {mobileText("记录已保存。")}
          <button disabled={busy} onClick={() => perform(complete)}>
            {mobileText("完成")}
          </button>
        </p>
      ) : draft?.submitting ? (
        <p role="alert">
          {mobileText(
            "上次保存中断，记录可能已经写入。请先返回表格核对，避免重复添加。"
          )}
        </p>
      ) : table && draft ? (
        <div className="record-draft-body">
          <EidosFileRecordInspector
            variant="page"
            row={draft.row}
            fields={table.fields.filter((field) => !field.systemRole)}
            contentField={table.fields.find(
              (field) => field.id === table.table.contentFieldId
            )}
            disabled={busy}
            onCellEdit={async (row, field, value) => {
              const next = { ...row, [field.tableColumnName]: value }
              await save({ tableId: table.table.id, row: next })
              return {
                tableId: table.table.id,
                row: next,
                rowCount: table.rowCount,
              }
            }}
            onSearchRelation={(field, query) =>
              searchEidosFileRelationRecords(source, field, query)
            }
            onImportFiles={importFiles}
            onError={(e) => setError(String(e))}
          />
        </div>
      ) : (
        <div>
          <p>{mobileText("选择目标数据表")}</p>
          {tables.map((t) => (
            <button key={t.table.id} disabled={busy} onClick={() => choose(t)}>
              {t.table.name}
            </button>
          ))}
        </div>
      )}
      {draft && (
        <footer>
          {discarding ? (
            <>
              <span>
                {mobileText("放弃填写内容？分享原文和附件仍会保留。")}
              </span>
              <button
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    await request("recordDraft.remove")
                    current.current = null
                    setDraft(null)
                    setDiscarding(false)
                  })
                }
              >
                {mobileText("确认放弃")}
              </button>
              <button onClick={() => setDiscarding(false)}>
                {mobileText("取消")}
              </button>
            </>
          ) : (
            <button disabled={busy} onClick={() => setDiscarding(true)}>
              {mobileText("放弃此草稿")}
            </button>
          )}
        </footer>
      )}
    </section>
  )
}
