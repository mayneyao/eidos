import { useContext, useEffect, useRef, useState } from "react"
import { Dialog } from "radix-ui"
import {
  MobilePopoverLayer,
  Popover,
  PopoverTrigger,
  PopoverContent,
  useMobileSettingsClose,
} from "./ui/adaptive-popover"
import { ArrowLeft, Columns3, X, ChevronRight } from "lucide-react"
import type {
  CreateEidosFileFieldInput,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "./data-source"
import { useEidosFileUI } from "./context"
import { EidosFileViewFieldsPopover } from "./eidos-file-view-fields-popover"
import { EidosFileFieldPropertyPanel } from "./eidos-file-field-property-panel"
import { EidosFileFieldDeleteDialog } from "./eidos-file-field-delete-dialog"
import { EidosFileFieldCreatePopover } from "./eidos-file-field-create-popover"
import { eidosFileFieldKey } from "./eidos-file-field-visibility"
import {
  EidosFileFormulaEditorPopover,
  EidosFileLookupEditorPopover,
} from "./eidos-file-derived-field-editor"

/** Mobile navigation over the shared field editors and canonical Runtime mutations. */
export function MobileFields({
  source,
  table,
  tables,
  view,
  onSnapshot,
  initial,
  onClosed,
}: {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  tables: EidosFileTableSnapshot[]
  view?: EidosFileViewInfo
  onSnapshot(snapshot: EidosFileSnapshot): void
  initial?: { fieldId?: string; create?: boolean; position?: number }
  onClosed?: () => void
}) {
  const { themeName, translate: t } = useEidosFileUI()
  const closeSettings = useMobileSettingsClose()
  const layer = useContext(MobilePopoverLayer) + 10
  const [open, setOpen] = useState(Boolean(initial))
  const [selected, setSelected] = useState<string | null>(
    initial?.fieldId ?? null
  )
  const [creating, setCreating] = useState(initial?.create ?? false)
  const [allowedTypes, setAllowedTypes] =
    useState<readonly CreateEidosFileFieldInput["type"][]>()
  const [deleting, setDeleting] = useState(false)
  const [derived, setDerived] = useState<"formula" | "lookup" | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const pending = useRef<Promise<void> | null>(null)
  const initialized = useRef(false)
  const sheet = useRef<HTMLDivElement>(null)
  const field = table.fields.find(
    (item) => eidosFileFieldKey(item) === selected
  )
  const mutate = async (action: () => Promise<EidosFileSnapshot>) => {
    if (locked.current)
      throw new Error(t("A field update is already in progress"))
    locked.current = true
    setBusy(true)
    const operation = Promise.resolve().then(action).then(onSnapshot)
    pending.current = operation
    try {
      await operation
    } finally {
      if (pending.current === operation) pending.current = null
      locked.current = false
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!initial || view || initialized.current) return
    initialized.current = true
    void mutate(() =>
      source.createView(table.table.id, { name: t("Grid"), type: "grid" })
    ).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause))
    )
  }, [initial, view, source, table.table.id])
  const back = async (close = false) => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    try {
      await pending.current
    } catch {
      return false
    }
    if (locked.current || sheet.current?.querySelector('[aria-invalid="true"]'))
      return false
    if (derived && !close) {
      setDerived(null)
      return
    }
    setSelected(null)
    setCreating(false)
    setDerived(null)
    setError("")
    if (close) {
      setOpen(false)
      onClosed?.()
    }
    return true
  }
  return (
    <MobilePopoverLayer.Provider value={layer}>
      <Popover
        open={open}
        onOpenChange={(value) => {
          if (!value) {
            void back(true)
            return
          }
          setOpen(true)
          if (!view)
            void mutate(() =>
              source.createView(table.table.id, {
                name: t("Grid"),
                type: "grid",
              })
            ).catch((cause) =>
              setError(cause instanceof Error ? cause.message : String(cause))
            )
        }}
      >
        {!initial && (
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("Manage fields")}
              className="mobile-fields-trigger"
            >
              <Columns3 size={17} />
              <span>{t("Fields")}</span>
              <ChevronRight size={16} className="ml-auto" />
            </button>
          </PopoverTrigger>
        )}
        <PopoverContent
          ref={sheet}
          style={{ zIndex: layer + 1 }}
          data-eidos-file-root=""
          data-theme={themeName}
          className="eidos-file-root eidos-mobile-cell-sheet eidos-mobile-fields-sheet"
          aria-label={
            creating
              ? t("New field")
              : field
                ? t("Field properties")
                : t("Fields")
          }
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            void back(!(field || creating || derived))
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            sheet.current?.focus()
          }}
          mobileHeader={
            <header>
              {field || creating || !initial ? (
                <button
                  type="button"
                  aria-label={t("Back")}
                  disabled={busy}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => void back(!(field || creating || derived))}
                >
                  <ArrowLeft size={20} />
                </button>
              ) : null}
              <Dialog.Title tabIndex={-1}>
                {creating
                  ? t("New field")
                  : field
                    ? t("Field properties")
                    : t("Fields")}
              </Dialog.Title>
              <button
                type="button"
                aria-label={t("Close")}
                disabled={busy}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() =>
                  void back(true).then((closed) => {
                    if (closed) closeSettings?.()
                  })
                }
              >
                <X size={20} />
              </button>
            </header>
          }
        >
          <div className="eidos-mobile-fields-sheet eidos-mobile-fields-content">
            <div
              className="eidos-mobile-fields-list"
              hidden={Boolean(field) || creating}
            >
              {view ? (
                <EidosFileViewFieldsPopover
                  embedded
                  fields={table.fields}
                  view={view}
                  disabled={busy}
                  onUpdate={(changes) =>
                    mutate(() => source.updateView(view.id, changes))
                  }
                  onFieldOpen={(target) =>
                    setSelected(eidosFileFieldKey(target))
                  }
                  onFieldAdd={(types) => {
                    setAllowedTypes(types)
                    setCreating(true)
                  }}
                />
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  {busy ? t("Loading…") : error}
                </p>
              )}
            </div>
            {field && !creating && !derived ? (
              <EidosFileFieldPropertyPanel
                key={selected}
                field={field}
                tables={tables}
                disabled={busy}
                onClose={() => void back()}
                onUpdate={(target, changes) =>
                  mutate(() =>
                    source.updateField(
                      table.table.id,
                      eidosFileFieldKey(target),
                      changes
                    )
                  )
                }
                onDelete={() => setDeleting(true)}
                onEditFormula={() => setDerived("formula")}
                onEditLookup={() => setDerived("lookup")}
              />
            ) : null}
            {field && derived ? (
              <div className="eidos-mobile-fields-create">
                {derived === "formula" ? (
                  <EidosFileFormulaEditorPopover
                    embedded
                    open
                    field={field}
                    fields={table.fields}
                    onOpenChange={(value) => {
                      if (!value) setDerived(null)
                    }}
                    onPreview={
                      source.previewFormula
                        ? (input) =>
                            source.previewFormula!(table.table.id, input)
                        : undefined
                    }
                    onSave={(property) =>
                      mutate(() =>
                        source.updateField(
                          table.table.id,
                          eidosFileFieldKey(field),
                          { property }
                        )
                      )
                    }
                  />
                ) : (
                  <EidosFileLookupEditorPopover
                    embedded
                    open
                    field={field}
                    fields={table.fields}
                    tables={tables}
                    onOpenChange={(value) => {
                      if (!value) setDerived(null)
                    }}
                    onSave={(property) =>
                      mutate(() =>
                        source.updateField(
                          table.table.id,
                          eidosFileFieldKey(field),
                          { property }
                        )
                      )
                    }
                  />
                )}
              </div>
            ) : null}
            {creating ? (
              <div className="eidos-mobile-fields-create">
                <EidosFileFieldCreatePopover
                  embedded
                  open
                  table={table}
                  tables={tables}
                  allowedTypes={allowedTypes}
                  disabled={busy}
                  onOpenChange={(value) => {
                    if (!value) setCreating(false)
                  }}
                  onCreate={(input) =>
                    mutate(() =>
                      source.addField(
                        table.table.id,
                        input,
                        view && initial?.position !== undefined
                          ? { viewId: view.id, index: initial.position }
                          : undefined
                      )
                    )
                  }
                  onPreviewFormula={
                    source.previewFormula
                      ? (input) => source.previewFormula!(table.table.id, input)
                      : undefined
                  }
                />
              </div>
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
            {field && !derived ? (
              <p className="eidos-mobile-fields-scope">
                {t(
                  "Field properties apply to the whole table. Changes save immediately."
                )}
              </p>
            ) : null}
            <EidosFileFieldDeleteDialog
              field={deleting ? (field ?? null) : null}
              disabled={busy}
              onOpenChange={setDeleting}
              onError={(cause) =>
                setError(cause instanceof Error ? cause.message : String(cause))
              }
              onDelete={async (target) => {
                await mutate(() =>
                  source.deleteField(table.table.id, eidosFileFieldKey(target))
                )
                setDeleting(false)
                setSelected(null)
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </MobilePopoverLayer.Provider>
  )
}
