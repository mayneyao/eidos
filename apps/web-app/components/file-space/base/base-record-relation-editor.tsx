import { useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseRelationValue,
  BaseRow,
} from "@eidos.space/base"
import {
  decodeBaseRelationDisplay,
  decodeBaseRelationIds,
  encodeBaseRelationIds,
} from "@eidos.space/base"
import { Check, Link2, LoaderCircle, Search, Unlink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

function selectedRelations(row: BaseRow, field: BaseFieldInfo) {
  const ids = decodeBaseRelationIds(row[field.tableColumnName])
  const display = decodeBaseRelationDisplay(
    row[`${field.tableColumnName}__display`]
  )
  const titleById = new Map(display.map((value) => [value.id, value.title]))
  return ids.map((id) => ({ id, title: titleById.get(id) ?? id }))
}

export function BaseRecordRelationEditor({
  row,
  field,
  disabled,
  onChange,
  onSearch,
  onError,
}: {
  row: BaseRow
  field: BaseFieldInfo
  disabled: boolean
  onChange: (value: string | null) => Promise<void>
  onSearch: (
    field: BaseFieldInfo,
    query: string
  ) => Promise<BaseRelationValue[]>
  onError?: (error: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<BaseRelationValue[]>([])
  const [loading, setLoading] = useState(false)
  const requestRef = useRef(0)
  const values = selectedRelations(row, field)
  const selectedIds = useMemo(
    () => new Set(values.map((value) => value.id)),
    [values]
  )

  useEffect(() => {
    if (!open) return
    const request = ++requestRef.current
    const timer = setTimeout(
      () => {
        setLoading(true)
        void onSearch(field, query)
          .then((result) => {
            if (request === requestRef.current) setOptions(result)
          })
          .catch((error) => {
            if (request === requestRef.current) onError?.(error)
          })
          .finally(() => {
            if (request === requestRef.current) setLoading(false)
          })
      },
      query ? 120 : 0
    )
    return () => clearTimeout(timer)
  }, [field, onError, onSearch, open, query])

  const update = async (next: BaseRelationValue[]) => {
    await onChange(encodeBaseRelationIds(next.map((value) => value.id)))
    if (field.property?.multiple === false) setOpen(false)
  }

  const available = options.filter((option) => !selectedIds.has(option.id))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-8 w-full justify-start whitespace-normal px-2 py-1 text-left text-xs font-normal"
          aria-label={field.name}
          disabled={disabled}
        >
          <Link2 className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {values.length > 0
            ? values.map((value) => value.title).join(", ")
            : "No linked records"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex h-9 items-center gap-2 border-b px-2.5">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Link records</span>
          {values.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 gap-1 px-2 text-[11px] text-muted-foreground"
              disabled={disabled}
              onClick={() => void update([])}
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
        <div className="max-h-72 overflow-y-auto p-1.5">
          {values.length > 0 ? (
            <div className="mb-1.5">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Selected · {values.length}
              </p>
              {values.map((value) => (
                <button
                  key={value.id}
                  type="button"
                  className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent disabled:opacity-50"
                  disabled={disabled}
                  onClick={() =>
                    void update(
                      values.filter((candidate) => candidate.id !== value.id)
                    )
                  }
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-foreground text-background">
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{value.title}</span>
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
              className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent disabled:opacity-50"
              disabled={disabled}
              onClick={() =>
                void update(
                  field.property?.multiple === false
                    ? [option]
                    : [...values, option]
                )
              }
            >
              <span className="h-4 w-4 rounded-[3px] border" />
              <span className="min-w-0 flex-1 truncate">{option.title}</span>
            </button>
          ))}
          {loading ? (
            <div className="flex items-center justify-center gap-1.5 px-2 py-5 text-xs text-muted-foreground">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          ) : !loading && available.length === 0 ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">
              No records found
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
