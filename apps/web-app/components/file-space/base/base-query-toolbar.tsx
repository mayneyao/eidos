import { useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseFilterGroup,
  BaseFilterOperator,
  BaseFilterRule,
  BaseFilterValue,
  BaseSort,
} from "@eidos.space/base"
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Filter,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"

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

import {
  baseFieldDisplayName,
  isOptionalBaseSystemField,
} from "./base-field-visibility"

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
      isOptionalBaseSystemField(field) ||
      (!field.isHidden &&
        (field.tableColumnName === "title" ||
          field.valueKind === "source" ||
          field.valueKind === "materialized" ||
          field.valueKind === "derived"))
  )
}

function fieldDisplayType(field: BaseFieldInfo) {
  if (field.type === "created-time" || field.type === "last-edited-time") {
    return "datetime"
  }
  if (
    field.type === "row-id" ||
    field.type === "created-by" ||
    field.type === "last-edited-by"
  ) {
    return "text"
  }
  if (
    (field.type === "formula" || field.type === "lookup") &&
    typeof field.property?.displayType === "string"
  ) {
    return field.property.displayType
  }
  return field.type
}

function operatorsForField(field: BaseFieldInfo): BaseFilterOperator[] {
  const displayType = fieldDisplayType(field)
  if (displayType === "checkbox") {
    return ["equals", "not-equals", "is-empty", "is-not-empty"]
  }
  if (displayType === "number" || displayType === "rating") {
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
  if (displayType === "date" || displayType === "datetime") {
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
    value: fieldDisplayType(field) === "checkbox" ? true : "",
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
  const displayType = fieldDisplayType(field)
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
  if (displayType === "checkbox") {
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
        displayType === "number" || displayType === "rating"
          ? "number"
          : displayType === "date" || displayType === "datetime"
            ? "date"
            : "text"
      }
      value={String(
        Array.isArray(rule.value) ? (rule.value[0] ?? "") : (rule.value ?? "")
      )}
      placeholder="Value"
      onChange={(event) =>
        onChange(
          displayType === "number" || displayType === "rating"
            ? event.target.value === ""
              ? ""
              : Number(event.target.value)
            : event.target.value
        )
      }
    />
  )
}

const MAX_FILTER_GROUP_DEPTH = 2

function countFilterRules(group: BaseFilterGroup): number {
  return group.children.reduce(
    (count, child) =>
      count + (child.type === "rule" ? 1 : countFilterRules(child)),
    0
  )
}

function BaseFilterRuleEditor({
  fields,
  rule,
  onChange,
  onRemove,
}: {
  fields: BaseFieldInfo[]
  rule: BaseFilterRule
  onChange: (rule: BaseFilterRule) => void
  onRemove: () => void
}) {
  const field =
    fields.find((candidate) => candidate.tableColumnName === rule.field) ??
    fields[0]
  if (!field) return null
  return (
    <div className="grid grid-cols-[110px_150px_minmax(120px,1fr)_28px] items-start gap-1.5">
      <Select
        value={field.tableColumnName}
        onValueChange={(columnName) => {
          const nextField = fields.find(
            (candidate) => candidate.tableColumnName === columnName
          )
          if (nextField) onChange(defaultRule(nextField))
        }}
      >
        <SelectTrigger className="h-7 min-w-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((candidate) => (
            <SelectItem
              key={candidate.tableColumnName}
              value={candidate.tableColumnName}
            >
              {baseFieldDisplayName(candidate)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={rule.operator}
        onValueChange={(operator: BaseFilterOperator) =>
          onChange({
            ...rule,
            operator,
            ...(emptyOperators.has(operator)
              ? { value: undefined }
              : rule.value === undefined
                ? {
                    value: fieldDisplayType(field) === "checkbox" ? true : "",
                  }
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
        onChange={(value) => onChange({ ...rule, value })}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground"
        aria-label="Remove filter"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function BaseFilterAddMenu({
  canAddGroup,
  onAddRule,
  onAddGroup,
}: {
  canAddGroup: boolean
  onAddRule: () => void
  onAddGroup: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Add filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1">
        <button
          type="button"
          className="flex h-7 w-full items-center rounded-sm px-2 text-left text-xs hover:bg-accent"
          onClick={() => {
            onAddRule()
            setOpen(false)
          }}
        >
          Add condition
        </button>
        {canAddGroup ? (
          <button
            type="button"
            className="flex h-7 w-full items-center rounded-sm px-2 text-left text-xs hover:bg-accent"
            onClick={() => {
              onAddGroup()
              setOpen(false)
            }}
          >
            Add group
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function BaseFilterGroupEditor({
  fields,
  group,
  depth,
  onChange,
}: {
  fields: BaseFieldInfo[]
  group: BaseFilterGroup
  depth: number
  onChange: (group: BaseFilterGroup) => void
}) {
  const updateChild = (
    index: number,
    child: BaseFilterRule | BaseFilterGroup
  ) => {
    onChange({
      ...group,
      children: group.children.map((candidate, childIndex) =>
        childIndex === index ? child : candidate
      ),
    })
  }
  const removeChild = (index: number) => {
    onChange({
      ...group,
      children: group.children.filter((_, childIndex) => childIndex !== index),
    })
  }
  const firstField = fields[0]
  return (
    <div
      className={cn(
        "space-y-2",
        depth > 0 && "rounded-md border bg-muted/20 p-2"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {depth === 0 ? "Show rows where" : "Group where"}
        </span>
        <Select
          value={group.conjunction}
          onValueChange={(conjunction: "and" | "or") =>
            onChange({ ...group, conjunction })
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
      <div className="space-y-2">
        {group.children.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            No conditions in this group.
          </p>
        ) : null}
        {group.children.map((child, index) =>
          child.type === "rule" ? (
            <BaseFilterRuleEditor
              key={`rule-${index}-${child.field}`}
              fields={fields}
              rule={child}
              onChange={(next) => updateChild(index, next)}
              onRemove={() => removeChild(index)}
            />
          ) : (
            <div
              key={`group-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_28px] items-start gap-1.5 pl-3"
            >
              <BaseFilterGroupEditor
                fields={fields}
                group={child}
                depth={depth + 1}
                onChange={(next) => updateChild(index, next)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                aria-label="Remove filter group"
                onClick={() => removeChild(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        )}
      </div>
      <BaseFilterAddMenu
        canAddGroup={depth < MAX_FILTER_GROUP_DEPTH}
        onAddRule={() => {
          if (!firstField) return
          onChange({
            ...group,
            children: [...group.children, defaultRule(firstField)],
          })
        }}
        onAddGroup={() => {
          if (!firstField) return
          onChange({
            ...group,
            children: [
              ...group.children,
              {
                type: "group",
                conjunction: "and",
                children: [defaultRule(firstField)],
              },
            ],
          })
        }}
      />
    </div>
  )
}

function BaseFilterPopover({
  fields,
  value,
  disabled,
  onChange,
}: {
  fields: BaseFieldInfo[]
  value: BaseFilterGroup | null
  disabled?: boolean
  onChange: (filter: BaseFilterGroup | null) => Promise<void> | void
}) {
  const availableFields = useMemo(() => filterableFields(fields), [fields])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<BaseFilterGroup>(
    value ?? { type: "group", conjunction: "and", children: [] }
  )
  const [pendingAction, setPendingAction] = useState<"apply" | "clear" | null>(
    null
  )
  const pendingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open && !pendingRef.current) {
      setDraft(value ?? { type: "group", conjunction: "and", children: [] })
      setError(null)
    }
  }, [open, value])
  const commit = async (
    next: BaseFilterGroup | null,
    action: "apply" | "clear"
  ) => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPendingAction(action)
    setError(null)
    try {
      await onChange(next)
      setOpen(false)
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "Unable to update filters"
      )
    } finally {
      pendingRef.current = false
      setPendingAction(null)
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && pendingRef.current) return
        setOpen(nextOpen)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={value?.children.length ? "secondary" : "ghost"}
          size="sm"
          className="base-workbar-action h-7 gap-1 px-2 text-xs"
          aria-label="Filter Base rows"
          title="Filter"
          disabled={disabled || availableFields.length === 0}
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="base-workbar-action-label">Filter</span>
          {value && countFilterRules(value) > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              {countFilterRules(value)}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(640px,calc(100vh-32px))] w-[680px] max-w-[calc(100vw-32px)] overflow-y-auto p-3"
        aria-busy={pendingAction ? "true" : undefined}
      >
        <fieldset
          disabled={Boolean(pendingAction)}
          className="m-0 min-w-0 border-0 p-0"
        >
          <BaseFilterGroupEditor
            fields={availableFields}
            group={draft}
            depth={0}
            onChange={setDraft}
          />
          {error ? (
            <p
              className="mt-3 break-words border-t pt-2 text-xs text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end border-t pt-3">
            <div className="flex gap-1.5">
              {value ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => void commit(null, "clear")}
                >
                  {pendingAction === "clear" ? (
                    <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {pendingAction === "clear" ? "Clearing…" : "Clear"}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() =>
                  void commit(draft.children.length > 0 ? draft : null, "apply")
                }
              >
                {pendingAction === "apply" ? (
                  <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                ) : null}
                {pendingAction === "apply" ? "Applying…" : "Apply"}
              </Button>
            </div>
          </div>
        </fieldset>
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
  const [pendingAction, setPendingAction] = useState<"apply" | "clear" | null>(
    null
  )
  const pendingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open && !pendingRef.current) {
      setDraft(value)
      setError(null)
    }
  }, [open, value])
  const commit = async (next: BaseSort[], action: "apply" | "clear") => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPendingAction(action)
    setError(null)
    try {
      await onChange(next)
      setOpen(false)
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "Unable to update sorts"
      )
    } finally {
      pendingRef.current = false
      setPendingAction(null)
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && pendingRef.current) return
        setOpen(nextOpen)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={value.length ? "secondary" : "ghost"}
          size="sm"
          className="base-workbar-action h-7 gap-1 px-2 text-xs"
          aria-label="Sort Base rows"
          title="Sort"
          disabled={disabled || availableFields.length === 0}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="base-workbar-action-label">Sort</span>
          {value.length ? (
            <span className="text-[10px] text-muted-foreground">
              {value.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px] p-3"
        aria-busy={pendingAction ? "true" : undefined}
      >
        <fieldset
          disabled={Boolean(pendingAction)}
          className="m-0 min-w-0 border-0 p-0"
        >
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
                  <SelectTrigger
                    className="h-7 min-w-0 text-xs"
                    aria-label={`Sort field ${index + 1}`}
                  >
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
                        {baseFieldDisplayName(field)}
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
                  <SelectTrigger
                    className="h-7 text-xs"
                    aria-label={`Sort direction ${index + 1}`}
                  >
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
          {error ? (
            <p
              className="mt-3 break-words border-t pt-2 text-xs text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
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
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => void commit([], "clear")}
                >
                  {pendingAction === "clear" ? (
                    <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {pendingAction === "clear" ? "Clearing…" : "Clear"}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => void commit(draft, "apply")}
              >
                {pendingAction === "apply" ? (
                  <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                ) : null}
                {pendingAction === "apply" ? "Applying…" : "Apply"}
              </Button>
            </div>
          </div>
        </fieldset>
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
  searchResultCount = null,
  searchResultIndex = null,
  onSearchChange,
  onNavigateSearch,
  onFilterChange,
  onSortsChange,
}: {
  fields: BaseFieldInfo[]
  filter: BaseFilterGroup | null
  sorts: BaseSort[]
  search: string
  disabled?: boolean
  focusSearchToken?: number
  searchResultCount?: number | null
  searchResultIndex?: number | null
  onSearchChange: (search: string) => void
  onNavigateSearch?: (direction: "next" | "previous") => void
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
  useEffect(() => {
    if (search) setShowSearch(true)
  }, [search])
  const hasSearch = search.trim().length > 0
  const hasResults =
    hasSearch && searchResultCount !== null && searchResultCount > 0
  const resultStatus = !hasSearch
    ? ""
    : searchResultCount === null
      ? "Searching"
      : searchResultCount === 0
        ? "No results"
        : `${(searchResultIndex ?? 0) + 1} of ${searchResultCount}`
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-0.5">
      {showSearch ? (
        <div className="base-workbar-search flex h-7 items-center rounded-md border bg-background pl-2 pr-1 shadow-xs">
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
                return
              }
              if (event.key === "Enter" && hasResults) {
                event.preventDefault()
                onNavigateSearch?.(event.shiftKey ? "previous" : "next")
              }
            }}
          />
          {hasSearch ? (
            <span
              className="ml-1 shrink-0 text-[10px] tabular-nums text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {resultStatus}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-0.5 h-5 w-5 shrink-0 text-muted-foreground"
            aria-label="Previous search result"
            title="Previous result (Shift+Enter)"
            disabled={!hasResults}
            onClick={() => onNavigateSearch?.("previous")}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-muted-foreground"
            aria-label="Next search result"
            title="Next result (Enter)"
            disabled={!hasResults}
            onClick={() => onNavigateSearch?.("next")}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-muted-foreground"
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
          className="base-workbar-action h-7 gap-1 px-2 text-xs"
          aria-label="Search Base rows"
          title="Search"
          disabled={disabled}
          onClick={() => setShowSearch(true)}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="base-workbar-action-label">Search</span>
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
