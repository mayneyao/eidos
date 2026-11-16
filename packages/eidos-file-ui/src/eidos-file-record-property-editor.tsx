import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type RefObject,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSqlPrimitive,
  EidosFileRelationValue,
  FileEntry,
  UpdateEidosFileFieldInput,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileValues,
  encodeEidosFileValues,
} from "@eidos.space/eidos-file"
import {
  GridCellKind,
  type GridCell,
  type EditableGridCell,
  type ProvideEditorComponent,
} from "@glideapps/glide-data-grid"
import { Check, ExternalLink, Minus, X } from "lucide-react"
import { useEidosFileUI } from "./context"
import { eidosFileValueEditor } from "./eidos-file-value-editor"
import {
  eidosFileValueToGridCell,
  gridCellToEidosFileValue,
} from "./eidos-file-grid-adapter"
import { eidosFileSelectOptionsProperty } from "./eidos-file-field-properties"
import { eidosFileRecordFieldText } from "./eidos-file-record-format"
import { eidosFileFieldTypeIcon } from "./eidos-file-field-type-picker"
import { useEidosFileGridThemeForElement } from "./theme-internal"
import { useEidosFilePendingEdit } from "./use-pending-edit"
import { Button, Popover } from "./ui/primitives"
import {
  EidosFileValueEditorHost,
  EidosFileValueEditorTrigger,
  EidosFileGridEditorPopoverContent,
  EidosFileGridEditorSurface,
  EidosFileGridEditorHeader,
} from "./cells/grid-editor-surface"
import { SelectOptionItem } from "./ui/select-option-item"
import { eidosFileSelectOptions } from "./eidos-file-field-properties"
import { decodeEidosFileMultiSelectValues } from "@eidos.space/eidos-file"
import { eidosFileUrlIsActivatable } from "./eidos-file-url-activation"
import type { EidosFileAttachmentCell } from "./eidos-file-attachment-cell"

interface Session {
  token: number
  identity: string
  cell: GridCell
  originalCell: GridCell
  Editor: ProvideEditorComponent<GridCell>
  ownPopover: boolean
  ownSurface: boolean
}

function RecordTypeEditor({
  session,
  control,
  onChange,
  onFinish,
}: {
  session: Session
  control: RefObject<HTMLButtonElement>
  onChange: (cell: GridCell) => void
  onFinish: (cell?: GridCell) => void
}) {
  const { themeName } = useEidosFileUI()
  const theme = useEidosFileGridThemeForElement(themeName, control)
  return (
    <session.Editor
      value={session.cell}
      isHighlighted={false}
      forceEditMode
      theme={theme}
      target={{ x: 0, y: 0, width: 320, height: 32 }}
      onChange={onChange}
      onFinishedEditing={onFinish}
    />
  )
}

/** A record owns its field anchor and focus order, while Grid supplies type editing content. */
export function EidosFileRecordPropertyEditor({
  field,
  row,
  disabled,
  readOnly = false,
  display,
  onChange,
  onFieldUpdate,
  onImportFiles,
  onImportDroppedFiles,
  onSearchRelation,
  onError,
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
  disabled: boolean
  readOnly?: boolean
  display?: ReactNode
  onChange: (value: EidosFileSqlPrimitive) => Promise<void>
  onFieldUpdate?: (
    field: EidosFileFieldInfo,
    changes: UpdateEidosFileFieldInput
  ) => void | Promise<void>
  onImportFiles?: (options?: { imagesOnly?: boolean }) => Promise<FileEntry[]>
  onImportDroppedFiles?: (
    files: File[],
    source?: "drop" | "paste"
  ) => Promise<FileEntry[]>
  onSearchRelation?: (
    field: EidosFileFieldInfo,
    query: string
  ) => Promise<EidosFileRelationValue[]>
  onError?: (error: unknown) => void
}) {
  const {
    translate: t,
    timeZone,
    calendarTimeZoneData,
    activateUrl,
  } = useEidosFileUI()
  const control = useRef<HTMLButtonElement>(null)
  const [session, setSession] = useState<Session | null>(null)
  const sessionToken = useRef(0)
  const closeFocus = useRef(true)
  const previousSession = useRef(false)
  useLayoutEffect(() => {
    if (previousSession.current && !session && closeFocus.current)
      control.current?.focus()
    previousSession.current = Boolean(session)
  }, [session])
  const sessionRef = useRef(session)
  sessionRef.current = session
  const identity = `${row._id}:${field.id}`
  const identityRef = useRef(identity)
  const identityEpoch = useRef(0)
  if (identityRef.current !== identity) identityEpoch.current += 1
  identityRef.current = identity
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      sessionRef.current = null
    }
  }, [])
  const locked = disabled || readOnly
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  useEidosFilePendingEdit(session !== null)
  useEffect(() => {
    setSession(null)
  }, [identity])

  const value = row[field.tableColumnName]
  const cell = eidosFileValueToGridCell(
    field,
    value,
    disabled,
    row,
    t("Unavailable record"),
    true,
    timeZone,
    undefined,
    calendarTimeZoneData
  )
  const finish = (next?: GridCell, restoreFocus = closeFocus.current) => {
    const active = sessionRef.current
    if (!active || active.identity !== identityRef.current) return
    if (next && lockedRef.current) return
    setSession(null)
    sessionRef.current = null
    closeFocus.current = restoreFocus
    if (restoreFocus) control.current?.focus()
    if (next) {
      const value = gridCellToEidosFileValue(field, next as EditableGridCell)
      const original = gridCellToEidosFileValue(
        field,
        active.originalCell as EditableGridCell
      )
      if (!Object.is(original, value)) void onChange(value).catch(onError)
    }
  }
  const finishAndTab = (commit: () => void, reverse: boolean) => {
    const controls = [
      ...(control.current
        ?.closest('[data-eidos-file-detail-panel="record"]')
        ?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
        ) ?? []),
    ].filter((element) => !element.closest("[hidden]"))
    const index = control.current ? controls.indexOf(control.current) : -1
    const next = controls[index + (reverse ? -1 : 1)]
    closeFocus.current = false
    commit()
    if (!sessionRef.current) next?.focus()
  }
  const begin = () => {
    if (
      lockedRef.current ||
      sessionRef.current !== null ||
      !cell.allowOverlay ||
      (cell.kind === GridCellKind.Custom &&
        field.type === "relation" &&
        !onSearchRelation)
    )
      return
    closeFocus.current = true
    const token = ++sessionToken.current
    let initial = cell
    if (initial.kind === GridCellKind.Custom) {
      const kind = (initial.data as { kind?: string }).kind
      initial = {
        ...initial,
        data: {
          ...initial.data,
          ...(kind === "eidos-file-file-cell"
            ? {
                onImport: onImportFiles
                  ? async () => {
                      if (lockedRef.current)
                        throw new Error(t("Unable to save record"))
                      if (
                        sessionRef.current?.token !== token ||
                        identityRef.current !== identity
                      )
                        throw new Error(t("Unable to save record"))
                      return onImportFiles()
                    }
                  : undefined,
              }
            : {}),
          ...(kind === "eidos-file-relation-cell"
            ? { onSearch: (query: string) => onSearchRelation!(field, query) }
            : {}),
          ...(["select-cell", "multi-select-cell"].includes(kind ?? "")
            ? {
                allowCreate: Boolean(onFieldUpdate),
                onCreateOption: async (
                  options: readonly { name: string; color: string }[]
                ) => {
                  if (lockedRef.current)
                    throw new Error(t("Unable to save record"))
                  if (
                    sessionRef.current?.token !== token ||
                    identityRef.current !== identity
                  )
                    throw new Error(t("Unable to save record"))
                  await onFieldUpdate?.(field, {
                    property: eidosFileSelectOptionsProperty(field, options),
                  })
                },
              }
            : {}),
        },
      }
    }
    const provider = eidosFileValueEditor(initial)
    if (!provider) return
    const Editor = typeof provider === "object" ? provider.editor : provider
    const kind =
      initial.kind === GridCellKind.Custom
        ? (initial.data as { kind?: string }).kind
        : ""
    setSession({
      token,
      identity,
      cell: initial,
      originalCell: initial,
      Editor,
      ownPopover: [
        "date-picker-cell",
        "select-cell",
        "multi-select-cell",
        "eidos-file-relation-cell",
      ].includes(kind ?? ""),
      ownSurface:
        initial.kind === GridCellKind.Custom &&
        kind !== "eidos-file-url-image-cell" &&
        kind !== "rating-cell" &&
        kind !== "range-cell",
    })
  }

  if (!cell.allowOverlay && cell.kind !== GridCellKind.Boolean)
    return (
      <div className="min-h-8 px-2 py-1 text-xs">
        {display ??
          eidosFileRecordFieldText(row, field, timeZone, calendarTimeZoneData)}
        {field.type === "datetime" &&
        calendarTimeZoneData &&
        "readonly" in cell &&
        cell.readonly ? (
          <p className="text-muted-foreground">
            {t(
              "Dates outside 1970–2499 are read-only here. Your saved value is unchanged."
            )}
          </p>
        ) : null}
      </div>
    )

  if (cell.kind === GridCellKind.Boolean)
    return (
      <div className="flex min-h-8 items-center gap-1">
        <button
          type="button"
          role="checkbox"
          aria-label={field.name}
          aria-checked={cell.data == null ? "mixed" : cell.data === true}
          disabled={disabled}
          aria-disabled={readOnly || undefined}
          className="flex min-h-8 flex-1 items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => {
            if (!lockedRef.current)
              void onChange(
                gridCellToEidosFileValue(field, {
                  ...cell,
                  data: cell.data !== true,
                })
              ).catch(onError)
          }}
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-sm border border-input">
            {cell.data === true ? (
              <Check className="h-3 w-3" />
            ) : cell.data == null ? (
              <Minus className="h-3 w-3" />
            ) : null}
          </span>
          {cell.data == null
            ? t("Empty")
            : cell.data === true
              ? t("Checked")
              : t("Unchecked")}
        </button>
        {field.nullable !== false && cell.data != null ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label={t("Clear {field}", { field: field.name })}
            disabled={disabled}
            aria-disabled={readOnly || undefined}
            onClick={() => {
              if (!lockedRef.current)
                void onChange(
                  gridCellToEidosFileValue(field, { ...cell, data: null })
                ).catch(onError)
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        ) : null}
      </div>
    )

  const options = eidosFileSelectOptions(field)
  const formatted =
    cell.kind === GridCellKind.Text || cell.kind === GridCellKind.Number
      ? cell.displayData
      : cell.kind === GridCellKind.Custom &&
          (cell.data as { kind?: string }).kind === "date-picker-cell"
        ? String((cell.data as { displayDate?: string }).displayDate ?? "")
        : eidosFileRecordFieldText(row, field, timeZone, calendarTimeZoneData)
  const selected =
    field.type === "select"
      ? typeof value === "string" && value
        ? [value]
        : []
      : field.type === "multi-select"
        ? decodeEidosFileMultiSelectValues(
            typeof value === "string" ? value : null
          )
        : []
  const trigger = (
    <Button
      ref={control}
      type="button"
      variant="ghost"
      aria-label={field.name}
      aria-haspopup="dialog"
      disabled={disabled}
      aria-disabled={readOnly || undefined}
      className="h-auto min-h-8 w-full justify-start whitespace-normal px-2 py-1 text-left text-xs font-normal"
      onClick={begin}
    >
      {selected.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {selected.map((v) => (
            <SelectOptionItem
              key={v}
              option={
                options.find((o) => o.value === v) ?? {
                  name: v,
                  color: "default",
                }
              }
            />
          ))}
        </span>
      ) : (
        (display ??
        (formatted === "" || formatted === "Empty" ? t("Empty") : formatted))
      )}
    </Button>
  )
  const editor = session ? (
    <RecordTypeEditor
      session={session}
      control={control}
      onChange={(next) => {
        if (
          !lockedRef.current &&
          sessionRef.current?.token === session.token &&
          identityRef.current === session.identity
        )
          setSession((current) => (current ? { ...current, cell: next } : null))
      }}
      onFinish={(next) => {
        if (sessionRef.current?.token === session.token) finish(next)
      }}
    />
  ) : null
  const Icon = eidosFileFieldTypeIcon(field.type)
  const content = session?.ownSurface ? (
    editor
  ) : (
    <EidosFileGridEditorSurface>
      <EidosFileGridEditorHeader
        icon={Icon ? <Icon /> : null}
        title={field.name}
      />
      <div
        className="p-2"
        onKeyDownCapture={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            finish()
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            event.stopPropagation()
            finish(sessionRef.current?.cell)
          }
        }}
        style={
          {
            "--gdg-text-dark": "var(--foreground)",
            "--gdg-bg-cell": "var(--popover)",
            "--gdg-editor-font-size": "13px",
            "--gdg-font-family": "var(--font-ui, sans-serif)",
          } as CSSProperties
        }
      >
        {editor}
      </div>
    </EidosFileGridEditorSurface>
  )
  return (
    <div
      className="min-w-0"
      data-eidos-file-property-editor={field.type}
      data-eidos-file-property-editing={session ? "true" : undefined}
      onKeyDownCapture={(event) => {
        if (
          event.key !== "Tab" ||
          !sessionRef.current ||
          sessionRef.current.ownPopover ||
          sessionRef.current.ownSurface ||
          event.nativeEvent.isComposing
        )
          return
        event.preventDefault()
        event.stopPropagation()
        finishAndTab(
          () => finish(sessionRef.current?.cell, false),
          event.shiftKey
        )
      }}
      onDragOver={(event) => {
        if (
          onImportDroppedFiles &&
          field.type === "file" &&
          !lockedRef.current &&
          event.dataTransfer.types.includes("Files")
        )
          event.preventDefault()
      }}
      onDrop={(event) => {
        if (field.type !== "file" || !onImportDroppedFiles || lockedRef.current)
          return
        event.preventDefault()
        const files = Array.from(event.dataTransfer.files)
        if (!files.length) return
        const epoch = identityEpoch.current
        const dropToken = sessionRef.current?.token
        void onImportDroppedFiles(files, "drop")
          .then((imported) => {
            if (
              !mounted.current ||
              epoch !== identityEpoch.current ||
              lockedRef.current
            )
              throw new Error(t("Unable to save record"))
            if (
              dropToken !== undefined &&
              sessionRef.current?.token !== dropToken
            )
              throw new Error(t("Unable to save record"))
            const active = sessionRef.current
            const fileCell =
              active?.cell.kind === GridCellKind.Custom &&
              (active.cell.data as { kind?: string }).kind ===
                "eidos-file-file-cell"
                ? (active.cell as EidosFileAttachmentCell)
                : null
            const entries = fileCell
              ? fileCell.data.entries
              : decodeEidosFileValues(value)
            const ids = new Set(entries.map((e) => e.id))
            const uris = new Set(entries.map((e) => e.uri))
            const nextEntries = [
              ...entries,
              ...imported.filter((e) => !ids.has(e.id) && !uris.has(e.uri)),
            ]
            const encoded = encodeEidosFileValues(nextEntries)
            if (fileCell && active) {
              setSession({
                ...active,
                cell: {
                  ...fileCell,
                  copyData: encoded,
                  data: { ...fileCell.data, entries: nextEntries },
                },
              })
              return
            }
            return onChange(encoded)
          })
          .catch(onError)
      }}
    >
      <EidosFileValueEditorHost
        value={{
          anchor: trigger,
          readOnly: locked,
          onTab: finishAndTab,
          onPointerDownOutside: () => {
            closeFocus.current = false
          },
          onEscapeKeyDown: () => {
            closeFocus.current = true
          },
          onCloseAutoFocus: (event) => {
            event.preventDefault()
            if (closeFocus.current) control.current?.focus()
          },
        }}
      >
        {session?.ownPopover ? (
          editor
        ) : (
          <Popover
            open={Boolean(session)}
            onOpenChange={(open) => {
              if (!open) finish(sessionRef.current?.cell)
            }}
          >
            <EidosFileValueEditorTrigger />
            <EidosFileGridEditorPopoverContent
              onPointerDownOutside={() => finish(sessionRef.current?.cell)}
              onEscapeKeyDown={(event) => {
                event.preventDefault()
                finish()
              }}
            >
              {content}
            </EidosFileGridEditorPopoverContent>
          </Popover>
        )}
      </EidosFileValueEditorHost>
      {field.type === "url" &&
      typeof value === "string" &&
      activateUrl &&
      eidosFileUrlIsActivatable(value) ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          aria-label={t("Open URL")}
          onClick={() => {
            void Promise.resolve(activateUrl(value)).catch(onError)
          }}
        >
          <ExternalLink className="h-3 w-3" />
          {t("Open URL")}
        </Button>
      ) : null}
    </div>
  )
}
