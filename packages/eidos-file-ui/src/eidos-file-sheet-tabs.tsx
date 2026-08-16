import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileTableInfo,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import { FileDown, LoaderCircle, Pencil, Settings2, Trash2 } from "lucide-react"

import { EidosFileSheetTabStrip } from "./eidos-file-editor-chrome"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu"
import {
  Button,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"
import { useEidosFileUI } from "./context"
import {
  eidosFileFieldKey,
  isEidosFileRecordLabelField,
} from "./eidos-file-field-visibility"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

export interface EidosFileSheetTabActions {
  canDelete: boolean
  delete: () => void
  deleteDisabledReason?: string
  disabled: boolean
  exportCsv?: () => void
  exportDisabled: boolean
  exportingCsv: boolean
  rename: () => void
  settings?: () => void
}

export type EidosFileSheetTabRenderer = (
  table: EidosFileTableInfo,
  tab: ReactNode,
  actions: EidosFileSheetTabActions
) => ReactNode

export interface EidosFileSheetTabsProps {
  tables: EidosFileTableInfo[]
  tableSnapshots?: readonly EidosFileTableSnapshot[]
  activeTableId: string | null
  disabled?: boolean
  status?: ReactNode
  createAction?: ReactNode
  onSelect: (tableId: string) => void
  onReorder?: (tableIds: string[]) => Promise<void> | void
  onRename?: (table: EidosFileTableInfo, name: string) => Promise<void> | void
  onDelete?: (table: EidosFileTableInfo) => Promise<void> | void
  onExportCsv?: (table: EidosFileTableInfo) => Promise<void> | void
  onSetRecordLabel?: (
    table: EidosFileTableSnapshot,
    field: EidosFileFieldInfo
  ) => Promise<void> | void
  onExportError?: (error: unknown) => void
  renderTab?: EidosFileSheetTabRenderer
}

interface RenameRequest {
  anchorRect: Pick<DOMRect, "height" | "left" | "top" | "width">
  table: EidosFileTableInfo
}

function EidosFileSheetTabContextMenu({
  tab,
  actions,
}: {
  tab: ReactNode
  actions: EidosFileSheetTabActions
}) {
  const { translate: t } = useEidosFileUI()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", closeOnEscape, true)
    return () => window.removeEventListener("keydown", closeOnEscape, true)
  }, [open])

  const afterMenuClose = (action: () => void) => {
    window.setTimeout(action, 0)
  }

  return (
    <ContextMenu onOpenChange={setOpen}>
      <ContextMenuTrigger asChild>{tab}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-max max-w-[calc(100vw-1rem)]"
        data-eidos-file-table-menu=""
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() => setOpen(false)}
      >
        <ContextMenuItem
          disabled={actions.disabled}
          onSelect={() => afterMenuClose(actions.rename)}
        >
          <Pencil />
          {t("Rename table")}
        </ContextMenuItem>
        {actions.settings ? (
          <ContextMenuItem
            disabled={actions.disabled}
            onSelect={() => afterMenuClose(actions.settings!)}
          >
            <Settings2 />
            {t("Table settings")}
          </ContextMenuItem>
        ) : null}
        {actions.exportCsv ? (
          <ContextMenuItem
            disabled={actions.exportDisabled || actions.exportingCsv}
            onSelect={() => afterMenuClose(actions.exportCsv!)}
          >
            <FileDown />
            {actions.exportingCsv
              ? t("Exporting CSV…")
              : t("Export entire table as CSV")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          disabled={!actions.canDelete}
          title={actions.deleteDisabledReason}
          onSelect={() => afterMenuClose(actions.delete)}
        >
          <Trash2 />
          {t("Delete table")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function EidosFileSheetTabs({
  tables,
  tableSnapshots,
  activeTableId,
  disabled = false,
  status,
  createAction,
  onSelect,
  onReorder,
  onRename,
  onDelete,
  onExportCsv,
  onSetRecordLabel,
  onExportError,
  renderTab,
}: EidosFileSheetTabsProps) {
  const { translate: t } = useEidosFileUI()
  const rootRef = useRef<HTMLDivElement>(null)
  const [renameRequest, setRenameRequest] = useState<RenameRequest | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EidosFileTableInfo | null>(
    null
  )
  const [exportingTableId, setExportingTableId] = useState<string | null>(null)
  const [settingsTarget, setSettingsTarget] =
    useState<EidosFileTableSnapshot | null>(null)
  const [recordLabelFieldId, setRecordLabelFieldId] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState<"rename" | "delete" | "settings" | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const errorId = useId()

  useEffect(() => {
    if (!renameRequest) return
    setName(renameRequest.table.name)
    setBusy(null)
    setError(null)
  }, [renameRequest])

  useEffect(() => {
    if (!settingsTarget) return
    const label = settingsTarget.fields.find(isEidosFileRecordLabelField)
    setRecordLabelFieldId(label ? eidosFileFieldKey(label) : "")
    setBusy(null)
    setError(null)
  }, [settingsTarget])

  const recordLabelFields = useMemo(
    () =>
      settingsTarget?.fields.filter(
        (field) => field.valueKind !== "system" && field.type !== "lookup"
      ) ?? [],
    [settingsTarget]
  )
  const currentRecordLabelFieldId = useMemo(() => {
    const field = settingsTarget?.fields.find(isEidosFileRecordLabelField)
    return field ? eidosFileFieldKey(field) : ""
  }, [settingsTarget])

  const renameAnchorStyle = useMemo<CSSProperties | undefined>(() => {
    if (!renameRequest) return undefined
    return {
      display: "block",
      height: renameRequest.anchorRect.height,
      left: renameRequest.anchorRect.left,
      pointerEvents: "none",
      position: "fixed",
      top: renameRequest.anchorRect.top,
      width: renameRequest.anchorRect.width,
    }
  }, [renameRequest])

  const requestRename = (table: EidosFileTableInfo) => {
    if (disabled || !onRename) return
    const tab = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(
        "[data-eidos-file-table-id]"
      ) ?? []
    ).find((candidate) => candidate.dataset.eidosFileTableId === table.id)
    const rect = tab?.getBoundingClientRect()
    if (!rect) return
    setRenameRequest({
      anchorRect: {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      },
      table,
    })
  }

  const submitRename = async (event: FormEvent) => {
    event.preventDefault()
    const table = renameRequest?.table
    const trimmed = name.trim()
    if (!table || !onRename || busy || !trimmed || trimmed === table.name) {
      return
    }
    setBusy("rename")
    setError(null)
    try {
      await onRename(table, trimmed)
      setRenameRequest(null)
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : t("Unable to rename table")
      )
    } finally {
      setBusy(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !onDelete || busy) return
    setBusy("delete")
    setError(null)
    try {
      await onDelete(deleteTarget)
      setDeleteTarget(null)
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("Unable to delete table")
      )
    } finally {
      setBusy(null)
    }
  }

  const saveTableSettings = async () => {
    const target = settingsTarget
    const field = recordLabelFields.find(
      (candidate) => eidosFileFieldKey(candidate) === recordLabelFieldId
    )
    if (!target || !field || !onSetRecordLabel || busy) return
    setBusy("settings")
    setError(null)
    try {
      await onSetRecordLabel(target, field)
      setSettingsTarget(null)
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : t("Unable to update table settings")
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div ref={rootRef} className="contents">
        <EidosFileSheetTabStrip
          tables={tables}
          activeTableId={activeTableId}
          disabled={disabled}
          status={status}
          createAction={createAction}
          onSelect={onSelect}
          onReorder={onReorder}
          renderTab={(table, tab) => {
            const canDelete =
              !disabled && Boolean(onDelete) && tables.length > 1
            const actions: EidosFileSheetTabActions = {
              canDelete,
              delete: () => {
                if (!canDelete) return
                setError(null)
                setDeleteTarget(table)
              },
              deleteDisabledReason: disabled
                ? t("Table changes are unavailable while saving")
                : !onDelete
                  ? t("Table deletion is unavailable")
                  : tables.length <= 1
                    ? t("An Eidos File must keep one table")
                    : undefined,
              disabled: disabled || !onRename,
              exportCsv: onExportCsv
                ? () => {
                    if (disabled || exportingTableId) return
                    setExportingTableId(table.id)
                    void Promise.resolve(onExportCsv(table))
                      .catch((exportError) => onExportError?.(exportError))
                      .finally(() => setExportingTableId(null))
                  }
                : undefined,
              exportDisabled: disabled,
              exportingCsv: exportingTableId === table.id,
              rename: () => requestRename(table),
              settings:
                tableSnapshots && onSetRecordLabel
                  ? () => {
                      const target = tableSnapshots.find(
                        (candidate) => candidate.table.id === table.id
                      )
                      if (!target) return
                      setError(null)
                      setSettingsTarget(target)
                    }
                  : undefined,
            }
            return renderTab ? (
              renderTab(table, tab, actions)
            ) : (
              <EidosFileSheetTabContextMenu tab={tab} actions={actions} />
            )
          }}
        />
      </div>

      <Popover
        open={Boolean(renameRequest)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRenameRequest(null)
            setError(null)
          }
        }}
      >
        {renameAnchorStyle ? (
          <PopoverAnchor asChild>
            <span
              data-eidos-file-table-rename-anchor
              aria-hidden="true"
              style={renameAnchorStyle}
            />
          </PopoverAnchor>
        ) : null}
        <PopoverContent align="start" side="top" className="w-80 p-0">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{t("Rename table")}</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t("This changes the display name inside the Eidos File.")}
            </p>
          </div>
          <form onSubmit={submitRename}>
            <div className="px-4 py-3">
              <label
                className="grid gap-1.5 text-xs font-medium"
                htmlFor={nameId}
              >
                {t("Name")}
                <Input
                  id={nameId}
                  value={name}
                  autoFocus
                  disabled={busy === "rename"}
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={error ? "true" : undefined}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    setName(event.target.value)
                    setError(null)
                  }}
                />
              </label>
              {error ? (
                <p
                  id={errorId}
                  className="mt-2 break-words text-xs text-destructive"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-4 py-2.5">
              <Button
                type="button"
                variant="ghost"
                disabled={busy === "rename"}
                onClick={() => setRenameRequest(null)}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  busy === "rename" ||
                  !name.trim() ||
                  name.trim() === renameRequest?.table.name
                }
              >
                {busy === "rename" ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    {t("Renaming…")}
                  </>
                ) : (
                  t("Rename")
                )}
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>

      <Dialog
        open={Boolean(settingsTarget)}
        onOpenChange={(open) => {
          if (!open && busy !== "settings") {
            setSettingsTarget(null)
            setError(null)
          }
        }}
      >
        <DialogContent className="max-w-sm" aria-busy={busy === "settings"}>
          <DialogHeader>
            <DialogTitle>{t("Table settings")}</DialogTitle>
            <DialogDescription>{settingsTarget?.table.name}</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-xs">
            <span className="font-medium">{t("Record label field")}</span>
            <Select
              value={recordLabelFieldId}
              disabled={busy === "settings"}
              onValueChange={setRecordLabelFieldId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[10020]">
                {recordLabelFields.map((field) => (
                  <SelectItem
                    key={eidosFileFieldKey(field)}
                    value={eidosFileFieldKey(field)}
                  >
                    {field.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[11px] leading-4 text-muted-foreground">
              {t("Used to identify records in relations and cards.")}
            </span>
          </label>
          {error ? (
            <p className="break-words text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy === "settings"}
              onClick={() => setSettingsTarget(null)}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              disabled={
                busy === "settings" ||
                !recordLabelFieldId ||
                recordLabelFieldId === currentRecordLabelFieldId
              }
              onClick={() => void saveTableSettings()}
            >
              {busy === "settings" ? t("Saving…") : t("Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDeleteTarget(null)
            setError(null)
          }
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Delete table “{name}”?", {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "All rows, fields, and views in this table will be removed from the Eidos File."
              )}
            </AlertDialogDescription>
            {error ? (
              <p className="break-words text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>
              {t("Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy === "delete"}
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              {busy === "delete" ? (
                <>
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  {t("Deleting…")}
                </>
              ) : (
                t("Delete table")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
