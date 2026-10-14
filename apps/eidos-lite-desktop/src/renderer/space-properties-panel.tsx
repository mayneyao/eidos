import { useEffect, useRef, useState } from "react"
import { Plus, RefreshCw, SlidersHorizontal, Pencil, X } from "lucide-react"
import {
  decodeEidosFileMultiSelectValues,
  encodeEidosFileMultiSelectValues,
  type EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import {
  EidosFileRecordFieldEditor,
  EidosFileUIProvider,
  eidosFileFieldTypeIcon,
} from "@eidos.space/eidos-file-ui"
import type { FileMetaPatch, FileMetaValue } from "@eidos.space/plugin-sdk"
import {
  propertyValueText,
  spacePropertyEditorField,
  type SpacePropertyDefinition,
  type SpacePropertyEntry,
  type SpacePropertySchema,
  type SpacePropertySelection,
  type SpacePropertyType,
} from "../shared/space-properties"
import { useEidosLiteI18n } from "./i18n"

function PropertyField({
  field,
  entries,
  disabled,
  onPatch,
  onDefine,
}: {
  field: SpacePropertyDefinition
  entries: SpacePropertyEntry[]
  disabled: boolean
  onPatch(patch: FileMetaPatch): Promise<boolean>
  onDefine(): void
}) {
  const { t } = useEidosLiteI18n()
  const editorField = spacePropertyEditorField(field)
  const FieldTypeIcon = eidosFileFieldTypeIcon(editorField.type)
  const values = entries.map((entry) => entry.values[field.key])
  const first = values[0]
  const mixed = values.some(
    (value) => JSON.stringify(value) !== JSON.stringify(first)
  )
  const [failedEdit, setFailedEdit] = useState<{
    value: EidosFileSqlPrimitive
  } | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const savedValue: EidosFileSqlPrimitive =
    first === undefined || first === null
      ? null
      : field.type === "tags" && Array.isArray(first)
        ? encodeEidosFileMultiSelectValues(first.map(String))
        : field.type === "checkbox"
          ? first === true
            ? 1
            : 0
          : typeof first === "string" || typeof first === "number"
            ? first
            : propertyValueText(first)
  const change = async (value: EidosFileSqlPrimitive) => {
    if (disabled) return
    setValidationError(null)
    let next: FileMetaValue
    if (typeof value === "bigint") {
      const number = Number(value)
      if (!Number.isSafeInteger(number)) {
        setValidationError(t("Enter a safe integer"))
        return
      }
      next = number
    } else if (field.type === "checkbox" && value !== null) {
      next = value === 1
    } else if (field.type === "tags" && value !== null) {
      next = decodeEidosFileMultiSelectValues(
        typeof value === "string" ? value : null
      )
    } else if (value instanceof Uint8Array) {
      return
    } else {
      next = value
    }
    const updated = await onPatch(
      value === null ? { remove: [field.key] } : { set: { [field.key]: next } }
    )
    setFailedEdit(updated ? null : { value })
  }
  return (
    <div className="eidos-file-record-field group/readonly grid min-w-0 gap-1.5 py-3">
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <p className="eidos-file-record-field-label flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          {FieldTypeIcon ? (
            <FieldTypeIcon
              aria-hidden="true"
              data-eidos-file-field-type-icon={editorField.type}
              className="h-3.5 w-3.5 shrink-0"
            />
          ) : null}
          <span className="truncate">{editorField.name}</span>
        </p>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            className="icon-button"
            disabled={disabled}
            title={t("Edit property definition")}
            aria-label={`${t("Edit property definition")} ${field.key}`}
            onClick={onDefine}
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={disabled || values.every((value) => value === undefined)}
            title={t("Clear property")}
            aria-label={`${t("Clear property")} ${field.key}`}
            onClick={() => void change(null)}
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <EidosFileRecordFieldEditor
        field={editorField}
        row={{
          _id: entries[0]?.path ?? ".",
          [editorField.tableColumnName]: failedEdit
            ? failedEdit.value
            : savedValue,
        }}
        mixed={mixed && !failedEdit}
        placeholder={mixed ? t("Mixed values") : t("Not set")}
        disabled={disabled}
        onChange={change}
      />
      {validationError && <p role="alert">{validationError}</p>}
      {failedEdit && (
        <div className="properties-retry">
          <button
            type="button"
            disabled={disabled}
            onClick={() => void change(failedEdit.value)}
          >
            {t("Retry")}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setFailedEdit(null)}
          >
            {t("Discard change")}
          </button>
        </div>
      )}
    </div>
  )
}

export function SpacePropertiesPanel({
  paths,
  theme = "light",
  disabled,
  onManage,
  onChanged,
  onClose,
}: {
  paths: string[]
  theme?: "light" | "dark"
  disabled: boolean
  onManage(directory: string | null): void
  onChanged?(): void
  onClose(): void
}) {
  const { t, locale } = useEidosLiteI18n()
  const [selection, setSelection] = useState<SpacePropertySelection | null>(
    null
  )
  const [schema, setSchema] = useState<SpacePropertySchema | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const mutationInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [revision, setRevision] = useState(0)
  const [newKey, setNewKey] = useState("")
  const [newType, setNewType] = useState<SpacePropertyType>("text")
  const [newOptions, setNewOptions] = useState("")
  const [adding, setAdding] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const epoch = useRef(0)
  const panel = useRef<HTMLElement>(null)
  const initialFocus = useRef(document.activeElement)
  const focused = useRef(false)
  useEffect(() => {
    if (focused.current) return
    const target = panel.current?.querySelector<
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | HTMLButtonElement
    >(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button[aria-haspopup]:not([disabled])"
    )
    if (!target) return
    focused.current = true
    if (
      document.activeElement === initialFocus.current ||
      document.activeElement === document.body
    )
      target.focus({ preventScroll: true })
  }, [selection, loading])
  const pathsKey = JSON.stringify(paths)
  useEffect(() => {
    const current = ++epoch.current
    setLoading(true)
    setError(null)
    const timeout = setTimeout(() => {
      const request = window.eidosLite
        .readEntryProperties(paths)
        .then((data) => {
          if (current === epoch.current) {
            setSelection(data)
            setSchema(data.schema)
          }
        })
      void request
        .catch((cause: unknown) => {
          if (current === epoch.current) setError(String(cause))
        })
        .finally(() => {
          if (current === epoch.current) setLoading(false)
        })
    }, 0)
    return () => {
      clearTimeout(timeout)
      epoch.current++
    }
  }, [pathsKey, revision])
  const patch = async (value: FileMetaPatch) => {
    if (mutationInFlight.current || disabled) return false
    const current = epoch.current
    mutationInFlight.current = true
    setSaving(true)
    setError(null)
    setStatus("")
    try {
      const update = await window.eidosLite.patchEntryProperties(paths, value)
      if (current !== epoch.current) return false
      if (update.updated.length) onChanged?.()
      setStatus(t("{count} items updated", { count: update.updated.length }))
      const batchError = update.errors
        .map((item) => `${item.path}: ${item.message}`)
        .join("\n")
      if (batchError) setError(batchError)
      try {
        const data = await window.eidosLite.readEntryProperties(paths)
        if (current !== epoch.current) return false
        setSelection(data)
        setSchema(data.schema)
      } catch (cause) {
        if (current === epoch.current) setError(batchError || String(cause))
        return false
      }
      return update.errors.length === 0
    } catch (cause) {
      if (current === epoch.current) setError(String(cause))
      return false
    } finally {
      mutationInFlight.current = false
      if (current === epoch.current) setSaving(false)
    }
  }
  const define = async () => {
    if (mutationInFlight.current || disabled || !newKey.trim()) return
    const current = epoch.current
    mutationInFlight.current = true
    setSaving(true)
    setError(null)
    try {
      const fields = await window.eidosLite.defineProperty({
        key: newKey.trim(),
        type: newType,
        ...(["select", "tags"].includes(newType)
          ? {
              options: [
                ...new Set(
                  newOptions
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                ),
              ],
            }
          : {}),
      })
      if (current !== epoch.current) return
      onChanged?.()
      setSchema(fields)
      setNewKey("")
      setNewOptions("")
      setAdding(false)
    } catch (cause) {
      if (current === epoch.current) setError(String(cause))
    } finally {
      mutationInFlight.current = false
      if (current === epoch.current) setSaving(false)
    }
  }
  const types: [SpacePropertyType, string][] = [
    ["text", "Text"],
    ["number", "Number"],
    ["rating", "Rating"],
    ["checkbox", "Checkbox"],
    ["select", "Select"],
    ["tags", "Tags"],
  ]
  return (
    <EidosFileUIProvider locale={locale} themeName={theme}>
      <aside
        ref={panel}
        className="version-panel properties-panel"
        aria-label={t("File properties")}
      >
        <header>
          <strong>{t("Properties")}</strong>
          <div>
            <button
              type="button"
              className="icon-button"
              title={t("Refresh")}
              aria-label={t("Refresh")}
              disabled={saving || loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={t("Close properties")}
              onClick={onClose}
            >
              <X size={14} />
            </button>
          </div>
        </header>
        <div className="properties-body" aria-busy={loading || saving}>
          <p className="properties-scope" title={paths.join("\n")}>
            {paths.length === 1
              ? paths[0] === "."
                ? t("Entire Space")
                : paths[0]
              : t("{count} items selected", { count: paths.length })}
          </p>
          {selection?.entries.length === 1 &&
            selection.entries[0]?.kind === "directory" && (
              <button
                type="button"
                className="properties-manage"
                disabled={saving || loading || disabled}
                onClick={() =>
                  onManage(
                    selection.entries[0]!.path === "."
                      ? null
                      : selection.entries[0]!.path
                  )
                }
              >
                <SlidersHorizontal size={14} /> {t("Manage folder properties")}
              </button>
            )}
          {error && (
            <div className="properties-error" role="alert">
              {error}
              <button
                type="button"
                onClick={() => setRevision((value) => value + 1)}
              >
                {t(selection ? "Refresh" : "Retry")}
              </button>
            </div>
          )}
          <p className="properties-status" role="status">
            {saving ? t("Saving…") : loading ? t("Loading…") : status}
          </p>
          {selection && (
            <>
              {schema?.fields.map((field) => (
                <PropertyField
                  key={`${pathsKey}:${field.key}`}
                  field={field}
                  entries={selection.entries}
                  disabled={saving || disabled || loading}
                  onPatch={patch}
                  onDefine={() => {
                    setNewKey(field.key)
                    setEditingKey(field.key)
                    setNewType(field.type)
                    setNewOptions(field.options?.join(", ") ?? "")
                    setAdding(true)
                  }}
                />
              ))}
              {Array.from(
                new Set(
                  selection.entries.flatMap((entry) =>
                    Object.keys(entry.values)
                  )
                )
              )
                .filter(
                  (key) => !schema?.fields.some((field) => field.key === key)
                )
                .map((key) => (
                  <div className="property-field" key={key}>
                    <div className="property-field-label">
                      <span>{key}</span>
                      <button
                        type="button"
                        disabled={saving || disabled || loading}
                        onClick={() => {
                          setNewKey(key)
                          setEditingKey(null)
                          setAdding(true)
                        }}
                      >
                        {t("Define property")}
                      </button>
                    </div>
                    <code>
                      {selection.entries
                        .map((entry) => propertyValueText(entry.values[key]))
                        .join(" · ")}
                    </code>
                  </div>
                ))}
            </>
          )}
          <div className="properties-add">
            {adding ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void define()
                }}
              >
                <label>
                  {t("Property name")}
                  <input
                    autoFocus
                    maxLength={1024}
                    value={newKey}
                    readOnly={editingKey !== null}
                    onChange={(event) => setNewKey(event.target.value)}
                    disabled={saving || disabled}
                  />
                </label>
                <label>
                  {t("Property type")}
                  <select
                    value={newType}
                    onChange={(event) =>
                      setNewType(event.target.value as SpacePropertyType)
                    }
                    disabled={saving || disabled || editingKey !== null}
                  >
                    {types.map(([value, label]) => (
                      <option key={value} value={value}>
                        {t(label)}
                      </option>
                    ))}
                  </select>
                </label>
                {["select", "tags"].includes(newType) && (
                  <label>
                    {t("Options, separated by commas")}
                    <input
                      value={newOptions}
                      onChange={(event) => setNewOptions(event.target.value)}
                      disabled={saving || disabled}
                    />
                  </label>
                )}
                <div>
                  <button
                    type="submit"
                    disabled={saving || disabled || !newKey.trim()}
                  >
                    {t("Save property")}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setAdding(false)}
                  >
                    {t("Cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                disabled={saving || disabled || loading}
                onClick={() => {
                  setNewKey("")
                  setEditingKey(null)
                  setNewType("text")
                  setNewOptions("")
                  setAdding(true)
                }}
              >
                <Plus size={14} />
                {t("Add property")}
              </button>
            )}
            <p>{t("Property definitions are shared across this Space.")}</p>
          </div>
        </div>
      </aside>
    </EidosFileUIProvider>
  )
}
