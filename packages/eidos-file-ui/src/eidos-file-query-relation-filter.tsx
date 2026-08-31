import { useEffect, useMemo, useRef, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileFilterRuleValue,
  EidosFileRelationValue,
} from "@eidos.space/eidos-file"
import { ChevronsUpDown, LoaderCircle, Search } from "lucide-react"

import type { EidosFileEditorDataSource } from "./data-source"
import { useEidosFileUI } from "./context"
import { useEidosFileRelationListbox } from "./eidos-file-relation-listbox"
import { EidosFileRelationOptionList } from "./eidos-file-relation-option-list"
import {
  resolveEidosFileRelationRecords,
  searchEidosFileRelationRecords,
} from "./eidos-file-relation-search"
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/primitives"

function relationIds(value: EidosFileFilterRuleValue | undefined): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap((entry) =>
    typeof entry === "string" && entry ? [entry] : []
  )
}

export function EidosFileQueryRelationFilter({
  field,
  source,
  value,
  multiple,
  onChange,
}: {
  field: EidosFileFieldInfo
  source: EidosFileEditorDataSource
  value: EidosFileFilterRuleValue | undefined
  multiple: boolean
  onChange: (value: string | string[]) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<EidosFileRelationValue[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const selectedIds = useMemo(() => relationIds(value), [value])
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedValues = useMemo(
    () =>
      selectedIds.map((id) => ({
        id,
        title: titles[id] ?? id,
      })),
    [selectedIds, titles]
  )

  useEffect(() => {
    if (selectedIds.length === 0) return
    let cancelled = false
    void resolveEidosFileRelationRecords(source, field, selectedIds)
      .then((records) => {
        if (cancelled) return
        setTitles((current) => ({
          ...current,
          ...Object.fromEntries(
            records.map((record) => [record.id, record.title])
          ),
        }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [field, selectedIds, source])

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
        setError(null)
        void searchEidosFileRelationRecords(source, field, query)
          .then((records) => {
            if (request !== requestRef.current) return
            setOptions(records)
            setTitles((current) => ({
              ...current,
              ...Object.fromEntries(
                records.map((record) => [record.id, record.title])
              ),
            }))
          })
          .catch((searchError) => {
            if (request !== requestRef.current) return
            setError(
              searchError instanceof Error
                ? searchError.message
                : t("Unable to search records")
            )
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
  }, [field, open, query, source, t])

  const available = useMemo(
    () => options.filter((option) => !selectedIdSet.has(option.id)),
    [options, selectedIdSet]
  )
  const choices = useMemo(
    () => [...selectedValues, ...available],
    [available, selectedValues]
  )
  const {
    activeOption,
    activeOptionId,
    activeDescendantId,
    listboxId,
    moveActiveOption,
    optionId,
    setActiveOptionId,
  } = useEidosFileRelationListbox(choices)

  const toggle = (option: EidosFileRelationValue) => {
    const next = selectedIdSet.has(option.id)
      ? selectedIds.filter((id) => id !== option.id)
      : multiple
        ? [...selectedIds, option.id]
        : [option.id]
    onChange(multiple ? next : (next[0] ?? ""))
    if (!multiple && !selectedIdSet.has(option.id)) setOpen(false)
  }

  const triggerLabel =
    selectedValues.length === 0
      ? t("Choose records")
      : selectedValues.length === 1
        ? selectedValues[0]!.title
        : t("{count} records", { count: selectedValues.length })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={t("Choose records for {field}", { field: field.name })}
          className="h-7 w-full min-w-0 justify-between gap-1 px-2 text-xs font-normal"
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            autoFocus
            role="combobox"
            aria-label={t("Search records for {field}", { field: field.name })}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeDescendantId}
            aria-busy={loading}
            className="h-8 pl-8 text-xs"
            placeholder={t("Search records")}
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
                toggle(activeOption)
              }
            }}
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          <EidosFileRelationOptionList
            accessibleName={t("{field} relation records", {
              field: field.name,
            })}
            activeOptionId={activeOptionId}
            availableValues={available}
            listboxId={listboxId}
            multiple={multiple}
            optionId={optionId}
            query={query}
            selectedValues={selectedValues}
            onActiveOptionChange={setActiveOptionId}
            onToggle={toggle}
          />
          {loading ? (
            <div
              className="flex items-center justify-center gap-1.5 px-2 py-5 text-xs text-muted-foreground"
              role="status"
            >
              <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              {t("Loading…")}
            </div>
          ) : error ? (
            <p className="px-2 py-3 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : available.length === 0 ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">
              {selectedValues.length > 0 && !query
                ? t("All loaded records are selected")
                : t("No records found")}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
