import { useRef, useState, type ComponentProps } from "react"
import { Dialog } from "radix-ui"
import { Check, X } from "lucide-react"
import {
  decodeEidosFileMultiSelectValues,
  encodeEidosFileMultiSelectValues,
  type EidosFileFieldInfo,
  type EidosFileRow,
  type EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import { useEidosFileUI } from "./context"
import { eidosFileSelectOptions } from "./eidos-file-field-properties"
import { EidosFileRecordFieldEditor } from "./eidos-file-record-field-editor"
import { SelectOptionItem } from "./ui/select-option-item"
import { EidosFileRecordRelationEditor } from "./eidos-file-record-relation-editor"
import { EidosFileRecordAttachmentEditor } from "./eidos-file-record-attachment-editor"

/** Touch editor; writes still go through the Grid's canonical mutation path. */
export function EidosFileMobileCellEditor({
  field,
  row,
  onSave,
  onClose,
  onSearchRelation,
  onImportFiles,
  onImportDroppedFiles,
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
  onSave(value: EidosFileSqlPrimitive): Promise<void>
  onClose(): void
  onSearchRelation?: ComponentProps<
    typeof EidosFileRecordRelationEditor
  >["onSearch"]
  onImportFiles?: ComponentProps<
    typeof EidosFileRecordAttachmentEditor
  >["onImportFiles"]
  onImportDroppedFiles?: ComponentProps<
    typeof EidosFileRecordAttachmentEditor
  >["onImportDroppedFiles"]
}) {
  const { themeName, translate: t } = useEidosFileUI()
  const [draft, setDraft] = useState(row)
  const draftRef = useRef(row)
  const contentRef = useRef<HTMLDivElement>(null)
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const change = async (value: EidosFileSqlPrimitive) => {
    draftRef.current = { ...draftRef.current, [field.tableColumnName]: value }
    setDraft(draftRef.current)
  }
  const finish = async () => {
    if (saving.current) return
    saving.current = true
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    // Blur validates and commits text/date drafts before the sheet is dismissed.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    if (contentRef.current?.querySelector('[aria-invalid="true"]')) {
      saving.current = false
      return
    }
    setBusy(true)
    setError("")
    try {
      const value = draftRef.current[
        field.tableColumnName
      ] as EidosFileSqlPrimitive
      if (!Object.is(value, row[field.tableColumnName])) await onSave(value)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const isSelect = field.type === "select" || field.type === "multi-select"
  const options = eidosFileSelectOptions(field)
  const raw = draft[field.tableColumnName]
  const selected =
    field.type === "multi-select"
      ? decodeEidosFileMultiSelectValues(typeof raw === "string" ? raw : null)
      : typeof raw === "string" && raw
        ? [raw]
        : []
  const setSelected = (values: string[]) =>
    void change(
      field.type === "multi-select"
        ? encodeEidosFileMultiSelectValues(values)
        : (values[0] ?? null)
    )
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) void finish()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="eidos-mobile-cell-backdrop" />
        <Dialog.Content
          ref={contentRef}
          data-eidos-file-root=""
          data-theme={themeName}
          className="eidos-file-root eidos-mobile-cell-sheet"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            void finish()
          }}
        >
          <div className="eidos-mobile-sheet-handle" aria-hidden="true" />
          <header>
            <button aria-label={t("Cancel")} disabled={busy} onClick={onClose}>
              <X size={20} />
            </button>
            <Dialog.Title>{field.name}</Dialog.Title>
            <button
              aria-label={t("Done")}
              disabled={busy}
              onClick={() => void finish()}
            >
              <Check size={20} />
            </button>
          </header>
          <div className="eidos-mobile-cell-body">
            {isSelect ? (
              <>
                <input
                  className="eidos-mobile-option-search"
                  aria-label={t("Search...")}
                  placeholder={t("Search...")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {selected.length > 0 && (
                  <div className="eidos-mobile-selected-options">
                    {selected.map((value) => {
                      const option = options.find(
                        (option) => option.value === value
                      )
                      return (
                        <button
                          key={value}
                          onClick={() =>
                            setSelected(
                              selected.filter((item) => item !== value)
                            )
                          }
                          disabled={busy}
                        >
                          <SelectOptionItem
                            theme={themeName}
                            option={option ?? { name: value, color: "default" }}
                          />
                          <X size={16} aria-label={t("Remove")} />
                        </button>
                      )
                    })}
                  </div>
                )}
                <div
                  className="eidos-mobile-option-list"
                  role="group"
                  aria-label={field.name}
                >
                  {options
                    .filter((option) =>
                      option.name
                        .toLocaleLowerCase()
                        .includes(search.toLocaleLowerCase())
                    )
                    .map((option) => (
                      <button
                        key={option.value}
                        disabled={busy}
                        aria-pressed={selected.includes(option.value)}
                        onClick={() =>
                          setSelected(
                            field.type === "select"
                              ? [option.value]
                              : selected.includes(option.value)
                                ? selected.filter(
                                    (value) => value !== option.value
                                  )
                                : [...selected, option.value]
                          )
                        }
                      >
                        <SelectOptionItem theme={themeName} option={option} />
                        {selected.includes(option.value) && <Check size={18} />}
                      </button>
                    ))}
                  {!options.some((option) =>
                    option.name
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase())
                  ) && <p>{t("No options")}</p>}
                </div>
              </>
            ) : field.type === "relation" && onSearchRelation ? (
              <EidosFileRecordRelationEditor
                inline
                field={field}
                row={draft}
                disabled={busy}
                onChange={change}
                onSearch={onSearchRelation}
                onError={(cause) => setError(String(cause))}
              />
            ) : field.type === "file" ? (
              <EidosFileRecordAttachmentEditor
                value={draft[field.tableColumnName]}
                disabled={busy}
                onChange={change}
                onImportFiles={onImportFiles}
                onImportDroppedFiles={onImportDroppedFiles}
                onError={(cause) => setError(String(cause))}
              />
            ) : (
              <EidosFileRecordFieldEditor
                field={field}
                row={draft}
                disabled={busy}
                onChange={change}
              />
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
