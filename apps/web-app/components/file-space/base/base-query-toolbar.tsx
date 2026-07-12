import { useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseFilterGroup,
  BaseFilterOperator,
  BaseFilterRule,
  BaseFilterValue,
  BaseSort,
} from "@eidos.space/base"
import { ArrowUpDown, Filter, Plus, Search, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const operatorLabels: Record<BaseFilterOperator, string> = {
  equals: "is",
  "not-equals": "is not",
  contains: "contains",
  "not-contains": "does not contain",
  "starts-with": "starts with",
  "ends-with": "ends with",
  "greater-than": "is greater than",
  "greater-than-or-equal": "is at least",
  "less-than": "is less than",
  "less-than-or-equal": "is at most",
  "is-empty": "is empty",
  "is-not-empty": "is not empty",
  "is-any-of": "has any of",
  "is-none-of": "has none of",
}

const emptyOperators = new Set<BaseFilterOperator>(["is-empty", "is-not-empty"])

function filterableFields(fields: BaseFieldInfo[]) {
  return fields.filter(
    (field) =>
      !field.isHidden &&
      (field.valueKind === "source" || field.tableColumnName === "title")
  )
}

function operatorsForField(field: BaseFieldInfo): BaseFilterOperator[] {
  if (field.type === "checkbox") {
    return ["equals", "not-equals", "is-empty", "is-not-empty"]
  }
  if (field.type === "number" || field.type === "rating") {
    return [
      "equals",
      "not-equals",
      "greater-than",
      "greater-than-or-equal",
      "less-than",
      "less-than-or-equal",
      "is-empty",
      "is-not-empty",
    ]
  }
  if (field.type === "date") {
    return [
      "equals",
      "not-equals",
      "greater-than",
      "less-than",
      "is-empty",
      "is-not-empty",
    ]
  }
  if (field.type === "multi-select") {
    return [
      "contains",
      "not-contains",
      "is-any-of",
      "is-none-of",
      "is-empty",
      "is-not-empty",
    ]
  }
  return [
    "equals",
    "not-equals",
    "contains",
    "not-contains",
    "starts-with",
    "ends-with",
    "is-empty",
    "is-not-empty",
  ]
}

function fieldOptions(field: BaseFieldInfo) {
  const options = field.property?.options
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    if (typeof option !== "object" || option === null) return []
    const candidate = option as { id?: unknown; name?: unknown }
    if (typeof candidate.id !== "string") return []
    return [
      {
        id: candidate.id,
        name:
          typeof candidate.name === "string" ? candidate.name : candidate.id,
      },
    ]
  })
}

function defaultRule(field: BaseFieldInfo): BaseFilterRule {
  return {
    type: "rule",
    field: field.tableColumnName,
    operator: operatorsForField(field)[0] ?? "equals",
    value: field.type === "checkbox" ? true : "",
  }
}

function FilterValueEditor({
  field,
  rule,
  onChange,
}: {
  field: BaseFieldInfo
  rule: BaseFilterRule
  onChange: (value: BaseFilterValue | BaseFilterValue[]) => void
}) {
  if (emptyOperators.has(rule.operator)) return null
  const options = fieldOptions(field)
  if (
    field.type === "multi-select" &&
    (rule.operator === "is-any-of" || rule.operator === "is-none-of")
  ) {
    const selected = new Set(Array.isArray(rule.value) ? rule.value : [])
    return (
      <div className="col-span-full ml-[116px] flex max-w-[320px] flex-wrap gap-1 pt-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground",
              selected.has(option.id) &&
                "border-foreground/20 bg-secondary text-foreground"
            )}
            onClick={() => {
              const next = new Set(selected)
              if (next.has(option.id)) next.delete(option.id)
              else next.add(option.id)
              onChange([...next] as BaseFilterValue[])
            }}
          >
            {option.name}
          </button>
        ))}
      </div>
    )
  }
  if (field.type === "select" || field.type === "multi-select") {
    return (
      <Select
        value={String(
          Array.isArray(rule.value) ? (rule.value[0] ?? "") : (rule.value ?? "")
        )}
        onValueChange={onChange}
      >
        <SelectTrigger className="h-7 min-w-0 text-xs">
          <SelectValue placeholder="Choose option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (field.type === "checkbox") {
    return (
      <Select
        value={String(rule.value ?? true)}
        onValueChange={(value) => onChange(value === "true")}
      >
        <SelectTrigger className="h-7 min-w-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Checked</SelectItem>
          <SelectItem value="false">Unchecked</SelectItem>
        </SelectContent>
      </Select>
    )
  }
  return (
    <Input
      className="h-7 min-w-0 text-xs"
      type={
        field.type === "number" || field.type === "rating"
          ? "number"
          : field.type === "date"
            ? "date"
            : "text"
      }
      value={String(
        Array.isArray(rule.value) ? (rule.value[0] ?? "") : (rule.value ?? "")
      )}
      placeholder="Value"
      onChange={(event) =>
        onChange(
          field.type === "number" || field.type === "rating"
            ? event.target.value === ""
              ? ""
              : Number(event.target.value)
            : event.target.value
        )
      }
    />
  )
}

function BaseFilterPopover({
  fields,
  value,
  disabled,
  focusSearchToken = 0,
  onChange,
}: {
  fields: BaseFieldInfo[]
  value: BaseFilterGroup | null
  disabled?: boolean
  focusSearchToken?: number
  onChange: (filter: BaseFilterGroup | null) => Promise<void> | void
}) {
  const availableFields = useMemo(() => filterableFields(fields), [fields])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<BaseFilterGroup>(
    value ?? { type: "group", conjunction: "and", children: [] }
  )
  useEffect(() => {
    if (open) {
      setDraft(value ?? { type: "group", conjunction: "and", children: [] })
    }
  }, [open, value])
  const rules = draft.children.flatMap((child, childIndex) =>
    child.type === "rule" ? [{ rule: child, childIndex }] : []
  )
  const updateRule = (index: number, next: BaseFilterRule) => {
    setDraft((current) => ({
      ...current,
      children: current.children.map((child, childIndex) =>
        childIndex === index ? next : child
      ),
    }))
  }
  const apply = async () => {
    await onChange(draft.children.length > 0 ? draft : null)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={value?.children.length ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={disabled || availableFields.length === 0}
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
          {value?.children.length ? (
            <span className="text-[10px] text-muted-foreground">
              {value.children.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[520px] p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">Show rows where</div>
          <Select
            value={draft.conjunction}
            onValueChange={(conjunction: "and" | "or") =>
              setDraft((current) => ({ ...current, conjunction }))
            }
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">All match</SelectItem>
              <SelectItem value="or">Any match</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-2 space-y-2">
          {rules.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No filters. Add a condition to narrow this view.
            </p>
          ) : null}
          {rules.map(({ rule, childIndex }, index) => {
            const field =
              availableFields.find(
                (candidate) => candidate.tableColumnName === rule.field
              ) ?? availableFields[0]
            if (!field) return null
            return (
              <div
                key={`${rule.field}-${index}`}
                className="grid grid-cols-[110px_150px_1fr_28px] items-start gap-1.5"
              >
                <Select
                  value={field.tableColumnName}
                  onValueChange={(columnName) => {
                    const nextField = availableFields.find(
                      (candidate) => candidate.tableColumnName === columnName
                    )
                    if (nextField)
                      updateRule(childIndex, defaultRule(nextField))
                  }}
                >
                  <SelectTrigger className="h-7 min-w-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((candidate) => (
                      <SelectItem
                        key={candidate.tableColumnName}
                        value={candidate.tableColumnName}
                      >
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={rule.operator}
                  onValueChange={(operator: BaseFilterOperator) =>
                    updateRule(childIndex, {
                      ...rule,
                      operator,
                      ...(emptyOperators.has(operator)
                        ? { value: undefined }
                        : rule.value === undefined
                          ? { value: field.type === "checkbox" ? true : "" }
                          : {}),
                    })
                  }
                >
                  <SelectTrigger className="h-7 min-w-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operatorsForField(field).map((operator) => (
                      <SelectItem key={operator} value={operator}>
                        {operatorLabels[operator]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FilterValueEditor
                  field={field}
                  rule={rule}
                  onChange={(nextValue) =>
                    updateRule(childIndex, { ...rule, value: nextValue })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label="Remove filter"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      children: current.children.filter(
                        (_, candidateIndex) => candidateIndex !== childIndex
                      ),
                    }))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={rules.length >= availableFields.length}
            onClick={() => {
              const used = new Set(rules.map(({ rule }) => rule.field))
              const field =
                availableFields.find(
                  (candidate) => !used.has(candidate.tableColumnName)
                ) ?? availableFields[0]
              if (field) {
                setDraft((current) => ({
                  ...current,
                  children: [...current.children, defaultRule(field)],
                }))
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add condition
          </Button>
          <div className="flex gap-1.5">
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  void Promise.resolve(onChange(null))
                  setOpen(false)
                }}
              >
                Clear
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={apply}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function BaseSortPopover({
  fields,
  value,
  disabled,
  onChange,
}: {
  fields: BaseFieldInfo[]
  value: BaseSort[]
  disabled?: boolean
  onChange: (sorts: BaseSort[]) => Promise<void> | void
}) {
  const availableFields = useMemo(() => filterableFields(fields), [fields])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])
  const apply = async () => {
    await onChange(draft)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={value.length ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={disabled || availableFields.length === 0}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sort
          {value.length ? (
            <span className="text-[10px] text-muted-foreground">
              {value.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-3">
        <div className="text-xs font-medium">Sort this view</div>
        <div className="mt-2 space-y-1.5">
          {draft.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Rows use their original order.
            </p>
          ) : null}
          {draft.map((sort, index) => (
            <div
              key={`${sort.field}-${index}`}
              className="grid grid-cols-[1fr_118px_28px] gap-1.5"
            >
              <Select
                value={sort.field}
                onValueChange={(field) =>
                  setDraft((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, field }
                        : candidate
                    )
                  )
                }
              >
                <SelectTrigger className="h-7 min-w-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((field) => (
                    <SelectItem
                      key={field.tableColumnName}
                      value={field.tableColumnName}
                      disabled={draft.some(
                        (candidate, candidateIndex) =>
                          candidateIndex !== index &&
                          candidate.field === field.tableColumnName
                      )}
                    >
                      {field.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sort.direction}
                onValueChange={(direction: "asc" | "desc") =>
                  setDraft((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, direction }
                        : candidate
                    )
                  )
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                aria-label="Remove sort"
                onClick={() =>
                  setDraft((current) =>
                    current.filter(
                      (_, candidateIndex) => candidateIndex !== index
                    )
                  )
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={draft.length >= availableFields.length}
            onClick={() => {
              const used = new Set(draft.map((sort) => sort.field))
              const field = availableFields.find(
                (candidate) => !used.has(candidate.tableColumnName)
              )
              if (field) {
                setDraft((current) => [
                  ...current,
                  { field: field.tableColumnName, direction: "asc" },
                ])
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add sort
          </Button>
          <div className="flex gap-1.5">
            {value.length ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  void Promise.resolve(onChange([]))
                  setOpen(false)
                }}
              >
                Clear
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={apply}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function BaseQueryToolbar({
  fields,
  filter,
  sorts,
  search,
  disabled,
  focusSearchToken = 0,
  onSearchChange,
  onFilterChange,
  onSortsChange,
}: {
  fields: BaseFieldInfo[]
  filter: BaseFilterGroup | null
  sorts: BaseSort[]
  search: string
  disabled?: boolean
  focusSearchToken?: number
  onSearchChange: (search: string) => void
  onFilterChange: (filter: BaseFilterGroup | null) => Promise<void> | void
  onSortsChange: (sorts: BaseSort[]) => Promise<void> | void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showSearch, setShowSearch] = useState(Boolean(search))
  useEffect(() => {
    if (showSearch) inputRef.current?.focus()
  }, [showSearch])
  useEffect(() => {
    if (focusSearchToken > 0) setShowSearch(true)
  }, [focusSearchToken])
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      {showSearch ? (
        <div className="flex h-7 w-52 items-center rounded-md border bg-background px-2 shadow-xs">
          <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={search}
            placeholder="Search rows"
            className="min-w-0 flex-1 bg-transparent text-xs outline-hidden placeholder:text-muted-foreground"
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onSearchChange("")
                setShowSearch(false)
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-1 h-5 w-5 text-muted-foreground"
            aria-label="Close search"
            onClick={() => {
              onSearchChange("")
              setShowSearch(false)
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={disabled}
          onClick={() => setShowSearch(true)}
        >
          <Search className="h-3.5 w-3.5" />
          Search
        </Button>
      )}
      <BaseFilterPopover
        fields={fields}
        value={filter}
        disabled={disabled}
        onChange={onFilterChange}
      />
      <BaseSortPopover
        fields={fields}
        value={sorts}
        disabled={disabled}
        onChange={onSortsChange}
      />
    </div>
  )
}
