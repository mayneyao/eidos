import { useEffect, useMemo, useRef, useState } from "react"
import type { BaseRelationValue } from "@eidos.space/base"
import { encodeBaseRelationIds } from "@eidos.space/base"
import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type ProvideEditorComponent,
} from "@glideapps/glide-data-grid"
import { Check, Link2, Search, Unlink } from "lucide-react"

import { drawDrilldownCell } from "@/components/table/views/grid/cells/helper"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface BaseRelationCellData {
  readonly kind: "base-relation-cell"
  readonly values: BaseRelationValue[]
  readonly multiple: boolean
  readonly onSearch?: (query: string) => Promise<BaseRelationValue[]>
}

export type BaseRelationCell = CustomCell<BaseRelationCellData>

export const BaseRelationCellEditor: ProvideEditorComponent<
  BaseRelationCell
> = ({ value: cell, onChange, onFinishedEditing }) => {
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<BaseRelationValue[]>([])
  const [values, setValues] = useState(cell.data.values)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!cell.data.onSearch) return
    const request = ++requestRef.current
    const timer = setTimeout(
      () => {
        setLoading(true)
        setError(null)
        void cell.data
          .onSearch?.(query)
          .then((result) => {
            if (request === requestRef.current) setOptions(result)
          })
          .catch((searchError) => {
            if (request !== requestRef.current) return
            setError(
              searchError instanceof Error
                ? searchError.message
                : "Unable to load records"
            )
          })
          .finally(() => {
            if (request === requestRef.current) setLoading(false)
          })
      },
      query ? 120 : 0
    )
    return () => clearTimeout(timer)
  }, [cell.data, query])

  const selectedIds = useMemo(
    () => new Set(values.map((value) => value.id)),
    [values]
  )
  const available = options.filter((option) => !selectedIds.has(option.id))

  const update = (values: BaseRelationValue[]) => {
    setValues(values)
    onChange({
      ...cell,
      copyData: encodeBaseRelationIds(values.map((value) => value.id)) ?? "",
      data: { ...cell.data, values },
    })
  }
  const toggle = (option: BaseRelationValue) => {
    if (selectedIds.has(option.id)) {
      update(values.filter((value) => value.id !== option.id))
      return
    }
    update(cell.data.multiple ? [...values, option] : [option])
  }

  return (
    <div
      className="flex max-h-[390px] min-h-48 w-[340px] flex-col overflow-hidden border bg-popover shadow-lg"
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault()
          onFinishedEditing({
            ...cell,
            copyData:
              encodeBaseRelationIds(values.map((value) => value.id)) ?? "",
            data: { ...cell.data, values },
          })
        }
      }}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2.5">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Link records</span>
        {values.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1 px-2 text-[11px] text-muted-foreground"
            onClick={() => update([])}
          >
            <Unlink className="h-3 w-3" />
            Clear
          </Button>
        ) : null}
      </div>
      <div className="relative border-b p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          autoFocus
          className="h-8 pl-8 text-xs"
          placeholder="Search records"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {values.length > 0 ? (
          <div className="mb-1.5">
            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Selected · {values.length}
            </p>
            {values.map((option) => (
              <button
                key={option.id}
                type="button"
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent"
                onClick={() => toggle(option)}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-foreground text-background">
                  <Check className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1 truncate">{option.title}</span>
              </button>
            ))}
          </div>
        ) : null}
        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {query ? "Results" : "Records"}
        </p>
        {available.map((option) => (
          <button
            key={option.id}
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent"
            onClick={() => toggle(option)}
          >
            <span className="h-4 w-4 rounded-[3px] border" />
            <span className="min-w-0 flex-1 truncate">{option.title}</span>
          </button>
        ))}
        {!loading && !error && available.length === 0 ? (
          <p className="px-2 py-5 text-center text-xs text-muted-foreground">
            {values.length > 0 && !query
              ? "All loaded records are linked"
              : "No records found"}
          </p>
        ) : null}
        {loading ? (
          <p className="px-2 py-5 text-center text-xs text-muted-foreground">
            Loading…
          </p>
        ) : null}
        {error ? (
          <p className="px-2 py-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-t px-2.5 text-[10px] text-muted-foreground">
        <span>
          {cell.data.multiple ? "Choose multiple records" : "Choose one record"}
        </span>
        <span>Enter to finish</span>
      </div>
    </div>
  )
}

export const BaseRelationCellRenderer: CustomRenderer<BaseRelationCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is BaseRelationCell =>
    (cell.data as { kind?: unknown }).kind === "base-relation-cell",
  needsHover: false,
  needsHoverPosition: false,
  measure: (context, cell, theme) =>
    Math.max(
      160,
      cell.data.values.reduce(
        (width, value) => width + context.measureText(value.title).width + 24,
        theme.cellHorizontalPadding * 2
      )
    ),
  draw: (args) => drawDrilldownCell(args, args.cell.data.values),
  provideEditor: () => BaseRelationCellEditor,
  onPaste: () => undefined,
  onDelete: (cell) => ({
    ...cell,
    copyData: "",
    data: { ...cell.data, values: [] },
  }),
}
