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
import { Link2, LoaderCircle, Search, Unlink } from "lucide-react"

import { Button, Input } from "./ui/primitives"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/primitives"

import { useBaseRelationListbox } from "./base-relation-listbox"
import { BaseRelationOptionList } from "./base-relation-option-list"

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
  const values = useMemo(() => selectedRelations(row, field), [field, row])
  const selectedIds = useMemo(
    () => new Set(values.map((value) => value.id)),
    [values]
  )

  useEffect(() => {
    if (!open) {
      requestRef.current += 1
      setLoading(false)
      return
    }
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
    return () => {
      clearTimeout(timer)
      if (requestRef.current === request) requestRef.current += 1
    }
  }, [field, onError, onSearch, open, query])

  const update = async (next: BaseRelationValue[]) => {
    await onChange(encodeBaseRelationIds(next.map((value) => value.id)))
    if (field.property?.multiple === false) setOpen(false)
  }

  const available = useMemo(
    () => options.filter((option) => !selectedIds.has(option.id)),
    [options, selectedIds]
  )
  const choices = useMemo(() => [...values, ...available], [available, values])
  const {
    activeOption,
    activeOptionId,
    activeDescendantId,
    listboxId,
    moveActiveOption,
    optionId,
    setActiveOptionId,
  } = useBaseRelationListbox(choices)

  useEffect(() => {
    setActiveOptionId(available[0]?.id ?? values[0]?.id ?? null)
  }, [available, setActiveOptionId, values])

  const toggle = (option: BaseRelationValue) => {
    if (selectedIds.has(option.id)) {
      return update(values.filter((value) => value.id !== option.id))
    }
    return update(
      field.property?.multiple === false ? [option] : [...values, option]
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-8 w-full justify-start whitespace-normal px-2 py-1 text-left text-xs font-normal"
          aria-label={field.name}
          aria-haspopup="listbox"
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
            role="combobox"
            aria-label={`Search records for ${field.name}`}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeDescendantId}
            aria-busy={loading}
            className="h-8 pl-8 text-xs"
            placeholder="Search records"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                event.stopPropagation()
                moveActiveOption(event.key === "ArrowDown" ? 1 : -1)
                return
              }
              if (event.key === "Home" || event.key === "End") {
                event.preventDefault()
                event.stopPropagation()
                moveActiveOption(event.key === "Home" ? "first" : "last")
                return
              }
              if (
                event.key === "Enter" &&
                !event.nativeEvent.isComposing &&
                activeOption
              ) {
                event.preventDefault()
                event.stopPropagation()
                void toggle(activeOption)
              }
            }}
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          <BaseRelationOptionList
            accessibleName={`${field.name} relation records`}
            activeOptionId={activeOptionId}
            availableValues={available}
            disabled={disabled}
            listboxId={listboxId}
            multiple={field.property?.multiple !== false}
            optionId={optionId}
            query={query}
            selectedValues={values}
            onActiveOptionChange={setActiveOptionId}
            onToggle={(option) => void toggle(option)}
          />
          {loading ? (
            <div
              className="flex items-center justify-center gap-1.5 px-2 py-5 text-xs text-muted-foreground"
              role="status"
            >
              <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
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
