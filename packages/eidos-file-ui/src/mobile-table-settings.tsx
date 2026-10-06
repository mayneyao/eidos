import { useEidosFileUI } from "./context"
import { useEffect, useRef, useState } from "react"
import type {
  EidosFileSnapshot,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "./data-source"
import { Popover, PopoverContent } from "./ui/adaptive-popover"
import { MobileLayoutChoice } from "./mobile-view-layout"
import { eidosFileFieldKey } from "./eidos-file-field-visibility"

declare global {
  interface Window {
    eidosManageTables?: (mode: "create" | "edit") => void
  }
}

export function MobileTableSettings({
  source,
  table,
  onSnapshot,
  onSelect,
}: {
  source: EidosFileEditorDataSource
  table?: EidosFileTableSnapshot
  onSnapshot(snapshot: EidosFileSnapshot): void
  onSelect(id: string): void
}) {
  const t = useEidosFileUI().translate
  const [mode, setMode] = useState<"create" | "edit" | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [label, setLabel] = useState("")
  const [contentField, setContentField] = useState("__none__")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const pending = useRef(false)
  const current = useRef(table)
  current.current = table
  useEffect(() => {
    const open = (value: "create" | "edit") => {
      if (pending.current || (value === "edit" && !current.current)) return
      setMode(value)
      setError("")
      setName(value === "edit" ? (current.current?.table.name ?? "") : "")
      setDescription(
        value === "edit" ? (current.current?.table.description ?? "") : ""
      )
      setLabel(current.current?.fields.find((f) => f.isRecordLabel)?.id ?? "")
      setContentField(current.current?.table.contentFieldId ?? "__none__")
    }
    window.eidosManageTables = open
    return () => {
      if (window.eidosManageTables === open) delete window.eidosManageTables
    }
  }, [])
  return (
    <Popover
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open && !pending.current) setMode(null)
      }}
    >
      <PopoverContent
        aria-label={mode === "create" ? t("New table") : t("Table settings")}
      >
        <form
          className="mobile-table-settings mobile-layout-settings"
          onSubmit={async (event) => {
            event.preventDefault()
            if (pending.current || !name.trim()) return
            pending.current = true
            setBusy(true)
            setError("")
            try {
              if (mode === "create") {
                const before = await source.getSnapshot()
                const snapshot = await source.createTable({
                  name: name.trim(),
                  description: description.trim() || undefined,
                  fields: [
                    { name: t("Title"), type: "text", isRecordLabel: true },
                  ],
                })
                onSnapshot(snapshot)
                const added = snapshot.tables.find(
                  (t) =>
                    !before.tables.some((old) => old.table.id === t.table.id)
                )
                if (added) onSelect(added.table.id)
              } else if (table) {
                onSnapshot(
                  await source.updateTable(table.table.id, {
                    name: name.trim(),
                    description: description.trim() || null,
                    contentFieldId:
                      contentField === "__none__" ? null : contentField,
                    ...(label ? { recordLabelFieldId: label } : {}),
                  })
                )
              }
              setMode(null)
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause))
            } finally {
              pending.current = false
              setBusy(false)
            }
          }}
        >
          {error && <p role="alert">{error}</p>}
          <label>
            {t("Table name")}
            <input
              aria-label={t("Table name")}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("For example: Projects")}
            />
          </label>
          <label>
            {t("Description")}
            <textarea
              aria-label={t("Table description")}
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("Optional")}
            />
          </label>
          {mode === "edit" && table && (
            <>
              <MobileLayoutChoice
                label={t("Record title field")}
                value={label}
                options={table.fields
                  .filter(
                    (f) => f.type !== "lookup" && f.valueKind !== "system"
                  )
                  .map((f) => ({ value: eidosFileFieldKey(f), label: f.name }))}
                disabled={busy}
                onChange={async (value) => setLabel(value)}
              />
              <MobileLayoutChoice
                label={t("Content field")}
                value={contentField}
                options={[
                  { value: "__none__", label: t("None") },
                  ...table.fields
                    .filter(
                      (field) =>
                        field.type === "text" &&
                        field.valueKind === "source" &&
                        field.systemRole == null
                    )
                    .map((field) => ({
                      value: eidosFileFieldKey(field),
                      label: field.name,
                    })),
                ]}
                disabled={busy}
                onChange={async (value) => setContentField(value)}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "Open records as pages and render this text field as Markdown."
                )}
              </p>
            </>
          )}
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="mobile-table-save"
          >
            {busy
              ? t("Saving…")
              : mode === "create"
                ? t("Create table")
                : t("Save table")}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
