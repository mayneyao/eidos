import { useEffect, useState, type AriaRole } from "react"
import type { BaseFieldInfo, BaseRow, BaseViewInfo } from "@eidos.space/base"
import { decodeBaseFilePaths } from "@eidos.space/base"
import type { SpaceBinaryFile } from "@eidos.space/file-space"
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
import { useTheme } from "@/components/theme-provider"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  NativeContextMenu,
  NativeContextMenuContent,
  NativeContextMenuItem,
  NativeContextMenuSeparator,
  NativeContextMenuSub,
  NativeContextMenuSubContent,
  NativeContextMenuSubTrigger,
  NativeContextMenuTrigger,
} from "@/components/ui/native-context-menu"

import { baseOptionColor, baseSelectOptions } from "./base-field-properties"
import { baseRecordFieldText, baseRecordTitle } from "./base-record-format"
import { orderedBaseFields } from "./base-view-layout"

function multiSelectIds(value: BaseRow[string]): string[] {
  if (typeof value !== "string" || value.length === 0) return []
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (candidate): candidate is string => typeof candidate === "string"
        )
      }
    } catch {
      // Fall through to the v1 comma-separated representation.
    }
  }
  return value.split(",").filter(Boolean)
}

function isEmptyValue(value: BaseRow[string]): boolean {
  return value === null || value === undefined || value === ""
}

function imageMimeType(path: string): string {
  const extension = path.split("?")[0]?.split(".").at(-1)?.toLowerCase()
  if (extension === "png") return "image/png"
  if (extension === "gif") return "image/gif"
  if (extension === "webp") return "image/webp"
  if (extension === "svg") return "image/svg+xml"
  if (extension === "avif") return "image/avif"
  return "image/jpeg"
}

function BaseRecordCover({
  row,
  field,
  compact,
  fitContent,
  readBinary,
}: {
  row: BaseRow
  field: BaseFieldInfo
  compact: boolean
  fitContent: boolean
  readBinary?: (path: string) => Promise<SpaceBinaryFile>
}) {
  const path = decodeBaseFilePaths(row[field.tableColumnName]).at(0)
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let active = true
    setSource(null)
    if (!path) return
    if (/^https?:/i.test(path)) {
      setSource(path)
      return
    }
    if (!readBinary) return
    void readBinary(path)
      .then((file) => {
        if (!active) return
        const content = new Uint8Array(file.content)
        objectUrl = URL.createObjectURL(
          new Blob([content.buffer], { type: imageMimeType(path) })
        )
        setSource(objectUrl)
      })
      .catch(() => {
        if (active) setSource(null)
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, readBinary])

  return (
    <div
      className={cn(
        "overflow-hidden border-b bg-gradient-to-br from-muted/40 to-muted",
        compact ? "h-28" : "h-36"
      )}
    >
      {source ? (
        <img
          src={source}
          alt=""
          className={cn(
            "h-full w-full",
            fitContent ? "object-contain" : "object-cover"
          )}
        />
      ) : null}
    </div>
  )
}

function CardFieldValue({
  field,
  row,
}: {
  field: BaseFieldInfo
  row: BaseRow
}) {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"
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
    const option = baseSelectOptions(field).find(
      (candidate) => candidate.id === value
    )
    if (!option) return <span className="text-muted-foreground">Empty</span>
    return (
      <span
        className="max-w-full truncate rounded px-1.5 py-0.5 text-[11px] text-foreground"
        style={{ backgroundColor: baseOptionColor(option.color, theme) }}
      >
        {option.name}
      </span>
    )
  }
  if (field.type === "multi-select") {
    const optionById = new Map(
      baseSelectOptions(field).map((option) => [option.id, option])
    )
    const values = multiSelectIds(value)
    if (values.length === 0) {
      return <span className="text-muted-foreground">Empty</span>
    }
    return (
      <span className="flex min-w-0 flex-wrap gap-1">
        {values.slice(0, 3).map((id) => {
          const option = optionById.get(id)
          return (
            <span
              key={id}
              className="max-w-28 truncate rounded px-1.5 py-0.5 text-[11px] text-foreground"
              style={{
                backgroundColor: baseOptionColor(
                  option?.color ?? "default",
                  theme
                ),
              }}
            >
              {option?.name ?? id}
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
    const paths = decodeBaseFilePaths(value)
    return paths.length > 0 ? (
      <span className="flex min-w-0 items-center gap-1 text-xs">
        <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{paths.at(0)?.split("/").at(-1)}</span>
        {paths.length > 1 ? (
          <span className="shrink-0 text-muted-foreground">
            +{paths.length - 1}
          </span>
        ) : null}
      </span>
    ) : (
      <span className="text-muted-foreground">Empty</span>
    )
  }

  const text = baseRecordFieldText(row, field)
  return (
    <span
      className={cn(
        "line-clamp-2 break-words text-xs leading-4",
        text === "Empty" && "text-muted-foreground"
      )}
    >
      {text}
    </span>
  )
}

export function BaseRecordCard({
  row,
  fields,
  view,
  compact = false,
  readBinary,
  onOpen,
  onDelete,
  moveOptions,
  onMove,
  role,
  focused = false,
}: {
  row: BaseRow
  fields: BaseFieldInfo[]
  view: BaseViewInfo
  compact?: boolean
  readBinary?: (path: string) => Promise<SpaceBinaryFile>
  onOpen: (row: BaseRow) => void
  onDelete?: (row: BaseRow) => void
  moveOptions?: Array<{ id: string; label: string; disabled?: boolean }>
  onMove?: (row: BaseRow, targetId: string) => void
  role?: AriaRole
  focused?: boolean
}) {
  const hideEmptyFields = view.properties?.hideEmptyFields !== false
  const visibleFields = orderedBaseFields(fields, view)
    .filter(
      (field) =>
        field.tableColumnName !== "title" &&
        field.valueKind !== "system" &&
        (!hideEmptyFields || !isEmptyValue(row[field.tableColumnName]))
    )
    .slice(0, compact ? 4 : 6)
  const title = baseRecordTitle(row)
  const coverFieldName =
    typeof view.properties?.coverPreview === "string"
      ? view.properties.coverPreview
      : null
  const coverField = fields.find(
    (field) => field.tableColumnName === coverFieldName && field.type === "file"
  )

  const card = (
    <article
      className={cn(
        "group/card relative overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs outline-hidden transition-[box-shadow,border-color] hover:shadow-sm",
        focused &&
          "border-ring ring-2 ring-ring/45 ring-offset-2 ring-offset-background"
      )}
      aria-label={title}
      aria-current={focused ? "true" : undefined}
      data-base-row-id={String(row._id)}
      tabIndex={-1}
      role={role}
    >
      {coverField ? (
        <BaseRecordCover
          row={row}
          field={coverField}
          compact={compact}
          fitContent={view.properties?.fitContent !== false}
          readBinary={readBinary}
        />
      ) : null}
      <div className={cn("grid gap-3", compact ? "p-3" : "p-4")}>
        <div className="flex min-w-0 items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <h3 className="min-w-0 flex-1 break-words text-sm font-medium leading-5">
            {title}
          </h3>
          <span className="-mr-1 -mt-1 flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100"
              aria-label={`Open ${title}`}
              onClick={() => onOpen(row)}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            {onDelete || (onMove && moveOptions?.length) ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover/card:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100"
                    aria-label={`More actions for ${title}`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => onOpen(row)}>
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    Open details
                  </DropdownMenuItem>
                  {onMove && moveOptions?.length ? (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <MoveRight className="mr-2 h-3.5 w-3.5" />
                        Move to
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-44">
                        {moveOptions.map((option) => (
                          <DropdownMenuItem
                            key={option.id}
                            disabled={option.disabled}
                            onSelect={() => onMove(row, option.id)}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
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
                        Delete record
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </span>
        </div>
        {visibleFields.length > 0 ? (
          <div className="grid gap-2">
            {visibleFields.map((field) => (
              <div
                key={field.tableColumnName}
                className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2 text-xs"
              >
                <span className="truncate text-[11px] text-muted-foreground">
                  {field.name}
                </span>
                <span className="min-w-0">
                  <CardFieldValue field={field} row={row} />
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )

  if (!onDelete && !(onMove && moveOptions?.length)) return card
  return (
    <NativeContextMenu>
      <NativeContextMenuTrigger asChild>{card}</NativeContextMenuTrigger>
      <NativeContextMenuContent className="w-52">
        <NativeContextMenuItem onClick={() => onOpen(row)}>
          Open details
        </NativeContextMenuItem>
        {onMove && moveOptions?.length ? (
          <NativeContextMenuSub>
            <NativeContextMenuSubTrigger>Move to</NativeContextMenuSubTrigger>
            <NativeContextMenuSubContent>
              {moveOptions.map((option) => (
                <NativeContextMenuItem
                  key={option.id}
                  disabled={option.disabled}
                  onClick={() => onMove(row, option.id)}
                >
                  {option.label}
                </NativeContextMenuItem>
              ))}
            </NativeContextMenuSubContent>
          </NativeContextMenuSub>
        ) : null}
        {onDelete ? (
          <>
            {onMove && moveOptions?.length ? (
              <NativeContextMenuSeparator />
            ) : null}
            <NativeContextMenuItem onClick={() => onDelete(row)}>
              Delete record
            </NativeContextMenuItem>
          </>
        ) : null}
      </NativeContextMenuContent>
    </NativeContextMenu>
  )
}
