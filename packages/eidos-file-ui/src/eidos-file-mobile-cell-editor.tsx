import { useRef, useState, type ComponentProps } from "react"
import { Dialog } from "radix-ui"
import { Check, Star, X } from "lucide-react"
import {
  decodeEidosFileMultiSelectValues,
  encodeEidosFileMultiSelectValues,
  type EidosFileFieldInfo,
  type EidosFileRow,
  type EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import { useEidosFileUI } from "./context"
import {
  eidosFileSelectOptions,
  type EidosFileSelectOption,
} from "./eidos-file-field-properties"
import { EidosFileRecordFieldEditor } from "./eidos-file-record-field-editor"
import { SelectOptionItem } from "./ui/select-option-item"
import { EidosFileRecordRelationEditor } from "./eidos-file-record-relation-editor"
import { EidosFileRecordAttachmentEditor } from "./eidos-file-record-attachment-editor"
import { MobileDateEditor } from "./mobile-date-editor"

/** Touch editor; writes still go through the Grid's canonical mutation path. */
export function EidosFileMobileCellEditor({
  field,
  row,
  onSave,
  onClose,
  onSearchRelation,
  onImportFiles,
  onImportDroppedFiles,
  onCreateOptions,
  readOnly = false,
}: {
  field: EidosFileFieldInfo
  readOnly?: boolean
  row: EidosFileRow
  onSave(value: EidosFileSqlPrimitive): Promise<void>
  onClose(): void
  onCreateOptions?(options: EidosFileSelectOption[]): Promise<void>
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
  const fieldCommitRef = useRef<(() => boolean) | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const change = async (value: EidosFileSqlPrimitive) => {
    if (readOnly) return
    draftRef.current = { ...draftRef.current, [field.tableColumnName]: value }
    setDraft(draftRef.current)
  }
  const finish = async () => {
    if (saving.current) return
    saving.current = true
    // Android date controls can blur without delivering React's focusout event.
    // Explicitly validate/commit the current draft before dismissing the sheet.
    if (fieldCommitRef.current?.() === false) {
      saving.current = false
      return
    }
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
      if (!readOnly && !Object.is(value, row[field.tableColumnName]))
        await onSave(value)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const isSelect = field.type === "select" || field.type === "multi-select"
  const [options, setOptions] = useState(() => eidosFileSelectOptions(field))
  const newOption = search.trim()
  const canCreate =
    Boolean(onCreateOptions) &&
    newOption.length > 0 &&
    !options.some(
      (option) =>
        option.value.toLocaleLowerCase() === newOption.toLocaleLowerCase()
    )
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
            const textInput = ["text", "url", "number", "integer"].includes(
              field.type
            )
              ? contentRef.current?.querySelector<
                  HTMLInputElement | HTMLTextAreaElement
                >("input, textarea")
              : null
            if (textInput) textInput.focus()
            else contentRef.current?.focus()
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
            {field.type === "date" || field.type === "datetime" ? (
              <MobileDateEditor
                value={row[field.tableColumnName]}
                datetime={field.type === "datetime"}
                disabled={busy}
                commitRef={fieldCommitRef}
                onChange={change}
              />
            ) : field.type === "checkbox" ? (
              <div
                className="eidos-mobile-option-list"
                role="group"
                aria-label={field.name}
              >
                {[
                  { value: 1, label: t("Checked") },
                  { value: 0, label: t("Unchecked") },
                  ...(field.nullable !== false
                    ? [{ value: null, label: t("Empty") }]
                    : []),
                ].map((option) => (
                  <button
                    key={option.label}
                    disabled={busy}
                    aria-pressed={
                      option.value === null
                        ? raw == null
                        : raw != null && Number(raw) === option.value
                    }
                    onClick={() => void change(option.value)}
                  >
                    {option.label}
                    {(option.value === null
                      ? raw == null
                      : raw != null && Number(raw) === option.value) && (
                      <Check size={18} />
                    )}
                  </button>
                ))}
              </div>
            ) : field.type === "rating" ? (
              <div>
                <div
                  className="flex flex-wrap gap-1"
                  role="group"
                  aria-label={field.name}
                >
                  {Array.from(
                    {
                      length:
                        typeof field.settings?.max === "number"
                          ? field.settings.max
                          : 5,
                    },
                    (_, index) => index + 1
                  ).map((value) => (
                    <button
                      key={value}
                      className="flex min-w-12 items-center justify-center"
                      disabled={busy}
                      aria-label={t("Rate {value}", { value })}
                      aria-pressed={Number(raw) === value && raw != null}
                      onClick={() => void change(value)}
                    >
                      <Star
                        size={28}
                        fill={Number(raw) >= value ? "currentColor" : "none"}
                      />
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    className="px-3"
                    disabled={busy}
                    aria-pressed={raw === 0}
                    onClick={() => void change(0)}
                  >
                    0
                  </button>
                  {field.nullable !== false && (
                    <button
                      className="px-3 text-muted-foreground"
                      disabled={busy}
                      onClick={() => void change(null)}
                    >
                      {t("Clear")}
                    </button>
                  )}
                </div>
              </div>
            ) : isSelect ? (
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
                  {canCreate && (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (!onCreateOptions || saving.current) return
                        saving.current = true
                        setBusy(true)
                        setError("")
                        try {
                          const next = [
                            ...options,
                            {
                              name: newOption,
                              value: newOption,
                              color: "default",
                            },
                          ]
                          await onCreateOptions(next)
                          setOptions(next)
                          setSelected(
                            field.type === "select"
                              ? [newOption]
                              : [...selected, newOption]
                          )
                          setSearch("")
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : String(cause)
                          )
                        } finally {
                          saving.current = false
                          setBusy(false)
                        }
                      }}
                    >
                      {t('Create "{value}"', { value: newOption })}
                    </button>
                  )}
                  {!canCreate &&
                    !options.some((option) =>
                      option.name
                        .toLocaleLowerCase()
                        .includes(search.toLocaleLowerCase())
                    ) && <p>{t("No options")}</p>}
                </div>
              </>
            ) : field.type === "relation" && onSearchRelation ? (
              <EidosFileRecordRelationEditor
                inline
                readOnly={readOnly}
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
                commitRef={fieldCommitRef}
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
