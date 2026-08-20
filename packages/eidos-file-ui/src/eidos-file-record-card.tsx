import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AriaRole,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileValues,
  decodeEidosFileMultiSelectValues,
} from "@eidos.space/eidos-file"
import {
  Check,
  Eye,
  FileText,
  Minus,
  MoreHorizontal,
  MoveRight,
  Paperclip,
  Trash2,
} from "lucide-react"
import { useEidosFileUI, type EidosFileUIHost } from "./context"
import { EidosFileEntryCoverSurface } from "./eidos-file-entry-surface"
import { cn } from "./lib/cn"
import { Button } from "./ui/primitives"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

import {
  eidosFileOptionColor,
  eidosFileUrlDisplaysImage,
} from "./eidos-file-field-properties"
import { eidosFileFieldDisplayName } from "./eidos-file-field-visibility"
import {
  createEidosFileRecordCardLayout,
  selectEidosFileRecordCardFields,
  type EidosFileRecordCardFieldLayout,
  type EidosFileRecordCardLayout,
} from "./eidos-file-record-card-layout"
import {
  eidosFileRecordFieldText,
  eidosFileRecordTitle,
} from "./eidos-file-record-format"
import { EidosFileUrlImageCoverSurface } from "./eidos-file-url-image-cover"
import {
  EIDOS_FILE_RECORD_CARD_TITLE_LINE_HEIGHT,
  eidosFileRecordCardFieldTextHeight,
  eidosFileRecordCardTitleHeight,
} from "./eidos-file-text-height"

const CARD_INTERACTIVE_TARGET =
  'button, a, input, select, textarea, summary, [role="button"], [role="menuitem"], [contenteditable="true"]'

function isCardInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(CARD_INTERACTIVE_TARGET) !== null
  )
}

function EidosFileRecordCover({
  row,
  field,
  compact,
  fitContent,
}: {
  row: EidosFileRow
  field: EidosFileFieldInfo
  compact: boolean
  fitContent: boolean
}) {
  const value = row[field.tableColumnName]
  if (eidosFileUrlDisplaysImage(field)) {
    return (
      <div
        className={cn(
          "overflow-hidden border-b bg-gradient-to-br from-muted/40 to-muted",
          compact ? "h-28" : "h-36"
        )}
      >
        <EidosFileUrlImageCoverSurface
          uri={typeof value === "string" ? value : ""}
          altText={field.name}
          fitContent={fitContent}
        />
      </div>
    )
  }
  const entry = decodeEidosFileValues(value).at(0)

  return (
    <div
      className={cn(
        "overflow-hidden border-b bg-gradient-to-br from-muted/40 to-muted",
        compact ? "h-28" : "h-36"
      )}
    >
      {entry ? (
        <EidosFileEntryCoverSurface entry={entry} fitContent={fitContent} />
      ) : null}
    </div>
  )
}

function CardFieldValue({
  layout,
  row,
  theme,
  translate,
  cardWidth,
  compact,
}: {
  layout: EidosFileRecordCardFieldLayout
  row: EidosFileRow
  theme: "dark" | "light"
  translate: EidosFileUIHost["translate"]
  cardWidth?: number
  compact: boolean
}) {
  const { field, optionByValue } = layout
  const value = row[field.tableColumnName]

  if (field.type === "checkbox") {
    const checked = value === true || value === 1 || value === "1"
    return checked ? (
      <Check className="h-3.5 w-3.5 text-foreground" />
    ) : (
      <Minus className="h-3.5 w-3.5 text-muted-foreground" />
    )
  }
  if (field.type === "select") {
    const rawValue = typeof value === "string" ? value : ""
    if (!rawValue) {
      return <span className="text-muted-foreground">{translate("Empty")}</span>
    }
    const option = optionByValue?.get(rawValue)
    return (
      <span
        className="max-w-full truncate rounded px-1.5 py-0.5 text-[11px] text-foreground"
        style={{
          backgroundColor: eidosFileOptionColor(
            option?.color ?? "default",
            theme
          ),
        }}
      >
        {option?.value ?? rawValue}
      </span>
    )
  }
  if (field.type === "multi-select") {
    const values = decodeEidosFileMultiSelectValues(
      typeof value === "string" ? value : null
    )
    if (values.length === 0) {
      return <span className="text-muted-foreground">{translate("Empty")}</span>
    }
    return (
      <span className="flex min-w-0 flex-wrap gap-1">
        {values.slice(0, 3).map((id) => {
          const option = optionByValue?.get(id)
          return (
            <span
              key={id}
              className="max-w-28 truncate rounded px-1.5 py-0.5 text-[11px] text-foreground"
              style={{
                backgroundColor: eidosFileOptionColor(
                  option?.color ?? "default",
                  theme
                ),
              }}
            >
              {option?.value ?? id}
            </span>
          )
        })}
        {values.length > 3 ? (
          <span className="text-[11px] text-muted-foreground">
            +{values.length - 3}
          </span>
        ) : null}
      </span>
    )
  }
  if (field.type === "file") {
    const entries = decodeEidosFileValues(value)
    return entries.length > 0 ? (
      <span className="flex min-w-0 items-center gap-1 text-xs">
        <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{entries.at(0)?.name}</span>
        {entries.length > 1 ? (
          <span className="shrink-0 text-muted-foreground">
            +{entries.length - 1}
          </span>
        ) : null}
      </span>
    ) : (
      <span className="text-muted-foreground">{translate("Empty")}</span>
    )
  }

  const text = eidosFileRecordFieldText(row, field)
  const displayText = text === "Empty" ? translate("Empty") : text
  const textLayout =
    cardWidth && cardWidth > 0
      ? eidosFileRecordCardFieldTextHeight(displayText, cardWidth, compact)
      : null
  return (
    <span
      data-eidos-file-card-text
      className={cn(
        "line-clamp-2 break-words text-xs leading-4",
        text === "Empty" && "text-muted-foreground"
      )}
      style={textLayout ? { height: textLayout.height } : undefined}
      title={textLayout?.overflowing ? displayText : undefined}
    >
      {displayText}
    </span>
  )
}

const DropdownMoveItems = memo(function DropdownMoveItems({
  row,
  moveOptions,
  disabledMoveOptionId,
  moveDisabled,
  onMove,
}: {
  row: EidosFileRow
  moveOptions: Array<{ id: string; label: string; disabled?: boolean }>
  disabledMoveOptionId?: string
  moveDisabled?: boolean
  onMove: (row: EidosFileRow, targetId: string) => void
}) {
  return moveOptions.map((option) => (
    <DropdownMenuItem
      key={option.id}
      disabled={
        moveDisabled || option.disabled || option.id === disabledMoveOptionId
      }
      onSelect={() => onMove(row, option.id)}
    >
      {option.label}
    </DropdownMenuItem>
  ))
})

export const EidosFileRecordCard = memo(function EidosFileRecordCard({
  row,
  fields,
  view,
  layout: providedLayout,
  compact = false,
  fixedHeight,
  cardWidth,
  onOpen,
  onDelete,
  moveOptions,
  disabledMoveOptionId,
  moveDisabled = false,
  onMove,
  role,
  positionInSet,
  setSize,
  focused = false,
}: {
  row: EidosFileRow
  fields: EidosFileFieldInfo[]
  view: EidosFileViewInfo
  layout?: EidosFileRecordCardLayout
  compact?: boolean
  fixedHeight?: number
  cardWidth?: number
  onOpen: (row: EidosFileRow) => void
  onDelete?: (row: EidosFileRow) => void
  moveOptions?: Array<{ id: string; label: string; disabled?: boolean }>
  disabledMoveOptionId?: string
  moveDisabled?: boolean
  onMove?: (row: EidosFileRow, targetId: string) => void
  role?: AriaRole
  positionInSet?: number
  setSize?: number
  focused?: boolean
}) {
  const layout =
    providedLayout ?? createEidosFileRecordCardLayout(fields, view, compact)
  const { themeName: theme, translate: t } = useEidosFileUI()
  const uniformFields = view.type === "gallery" || fixedHeight !== undefined
  const visibleFields = uniformFields
    ? layout.fields.slice(0, layout.fieldLimit)
    : selectEidosFileRecordCardFields(layout, row)
  const title = eidosFileRecordTitle(row, fields)
  const titleLayout = useMemo(
    () =>
      cardWidth && cardWidth > 0
        ? eidosFileRecordCardTitleHeight(title, cardWidth, compact)
        : null,
    [cardWidth, compact, title]
  )
  const [actionsOpen, setActionsOpen] = useState(false)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressPointerOpenRef = useRef(false)
  const openFromCard = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        isCardInteractiveTarget(event.target)
      ) {
        return
      }
      if (suppressPointerOpenRef.current) {
        suppressPointerOpenRef.current = false
        return
      }
      onOpen(row)
    },
    [onOpen, row]
  )
  const trackPointerStart = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || isCardInteractiveTarget(event.target)) return
      pointerStartRef.current = { x: event.clientX, y: event.clientY }
      suppressPointerOpenRef.current = false
    },
    []
  )
  const trackPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const start = pointerStartRef.current
      if (!start) return
      if (
        Math.abs(event.clientX - start.x) >= 6 ||
        Math.abs(event.clientY - start.y) >= 6
      ) {
        suppressPointerOpenRef.current = true
      }
    },
    []
  )

  const card = (
    <article
      className={cn(
        "group/card relative overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs outline-hidden transition-[box-shadow,border-color] hover:shadow-sm",
        role === "listitem" && "cursor-pointer",
        focused &&
          "border-ring ring-2 ring-ring/45 ring-offset-2 ring-offset-background"
      )}
      style={fixedHeight !== undefined ? { height: fixedHeight } : undefined}
      aria-current={focused ? "true" : undefined}
      aria-posinset={role === "listitem" ? positionInSet : undefined}
      aria-setsize={role === "listitem" ? setSize : undefined}
      data-eidos-file-row-id={String(row._id)}
      role={role}
      onClick={openFromCard}
      onPointerDown={trackPointerStart}
      onPointerMove={trackPointerMove}
      onPointerUp={() => {
        pointerStartRef.current = null
      }}
      onPointerCancel={() => {
        pointerStartRef.current = null
        suppressPointerOpenRef.current = false
      }}
    >
      {layout.coverField ? (
        <EidosFileRecordCover
          row={row}
          field={layout.coverField}
          compact={compact}
          fitContent={layout.fitContent}
        />
      ) : null}
      <div className={cn("grid gap-3", compact ? "p-3" : "p-4")}>
        <span
          data-eidos-file-card-actions
          className={cn(
            "pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-border/70 bg-card/95 p-0.5 opacity-0 transition-opacity",
            "group-hover/card:pointer-events-auto group-hover/card:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
            actionsOpen && "pointer-events-auto opacity-100"
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label={t("Open {title}", { title })}
            onClick={() => onOpen(row)}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {onDelete || (onMove && moveOptions?.length) ? (
            <DropdownMenu onOpenChange={setActionsOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  aria-label={t("More actions for {title}", { title })}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => onOpen(row)}>
                  <Eye className="mr-2 h-3.5 w-3.5" />
                  {t("Open details")}
                </DropdownMenuItem>
                {onMove && moveOptions?.length ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <MoveRight className="mr-2 h-3.5 w-3.5" />
                      {t("Move to")}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-44">
                      <DropdownMoveItems
                        row={row}
                        moveOptions={moveOptions}
                        disabledMoveOptionId={disabledMoveOptionId}
                        moveDisabled={moveDisabled}
                        onMove={onMove}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                {onDelete ? (
                  <>
                    {onMove && moveOptions?.length ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onDelete(row)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      {t("Delete record")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
        <div className="flex min-w-0 items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <h3
            className="line-clamp-3 min-w-0 flex-1 break-words text-sm font-medium leading-5"
            style={
              titleLayout
                ? {
                    height: titleLayout.height,
                    maxHeight: EIDOS_FILE_RECORD_CARD_TITLE_LINE_HEIGHT * 3,
                  }
                : undefined
            }
            title={titleLayout?.overflowing ? title : undefined}
          >
            {title}
          </h3>
        </div>
        {visibleFields.length > 0 ? (
          <div className="grid gap-2">
            {visibleFields.map((fieldLayout) => (
              <div
                key={fieldLayout.field.tableColumnName}
                className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2 text-xs"
              >
                <span className="truncate text-[11px] text-muted-foreground">
                  {eidosFileFieldDisplayName(fieldLayout.field)}
                </span>
                <span
                  className={cn(
                    "min-w-0",
                    fixedHeight !== undefined &&
                      cardWidth === undefined &&
                      "block max-h-6 truncate overflow-hidden"
                  )}
                >
                  <CardFieldValue
                    layout={fieldLayout}
                    row={row}
                    theme={theme}
                    translate={t}
                    cardWidth={cardWidth}
                    compact={compact}
                  />
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )

  return card
})
