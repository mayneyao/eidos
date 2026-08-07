import { useEffect, useMemo, useRef, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
  EidosFileFilterOperator,
  EidosFileFilterRule,
  EidosFileFilterValue,
  EidosFileSort,
} from "@eidos.space/eidos-file"
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

import { cn } from "./lib/cn"
import { useEidosFileUI } from "./context"
import { useEidosFileSearchNavigation } from "./eidos-file-search-navigation"
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"

import {
  eidosFileFieldDisplayName,
  eidosFileFieldKey,
  isEidosFileRecordLabelField,
  isOptionalEidosFileSystemField,
} from "./eidos-file-field-visibility"
import { eidosFileSelectOptions } from "./eidos-file-field-properties"
import { SelectOptionItem } from "./ui/select-option-item"

const operatorLabels: Record<EidosFileFilterOperator, string> = {
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
  "is-all-of": "has all of",
  "is-none-of": "has none of",
}

const emptyOperators = new Set<EidosFileFilterOperator>([
  "is-empty",
  "is-not-empty",
])

function filterableFields(fields: EidosFileFieldInfo[]) {
  return fields.filter(
    (field) =>
      isOptionalEidosFileSystemField(field) ||
      (!field.isHidden &&
        (isEidosFileRecordLabelField(field) ||
          field.valueKind === "source" ||
          field.valueKind === "materialized" ||
          field.valueKind === "derived"))
  )
}

function fieldDisplayType(field: EidosFileFieldInfo) {
  if (field.type === "created-time" || field.type === "last-edited-time") {
    return "datetime"
  }
  if (field.type === "row-id") {
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

function operatorsForField(
  field: EidosFileFieldInfo
): EidosFileFilterOperator[] {
  const displayType = fieldDisplayType(field)
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
  if (
    field.storageCodec === "json_array" ||
    field.storageCodec === "relation"
  ) {
    return ["contains", "not-contains", "is-empty", "is-not-empty"]
  }
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

function fieldOptions(field: EidosFileFieldInfo) {
  return eidosFileSelectOptions(field)
}

function defaultRule(field: EidosFileFieldInfo): EidosFileFilterRule {
  return {
    type: "rule",
    field: eidosFileFieldKey(field),
    operator: operatorsForField(field)[0] ?? "equals",
    value: fieldDisplayType(field) === "checkbox" ? true : "",
  }
}

function padTimeUnit(unit: number): string {
  return String(unit).padStart(2, "0")
}

function datetimeLocalFromFilterInstant(value: EidosFileFilterValue): string {
  if (typeof value !== "string" || value.length === 0) return ""
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return ""
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${padTimeUnit(date.getMonth() + 1)}-${padTimeUnit(date.getDate())}T${padTimeUnit(date.getHours())}:${padTimeUnit(date.getMinutes())}:${padTimeUnit(date.getSeconds())}`
}

function filterInstantFromDatetimeLocal(value: string): string {
  return new Date(value).toISOString()
}

function FilterValueEditor({
  field,
  rule,
  onChange,
}: {
  field: EidosFileFieldInfo
  rule: EidosFileFilterRule
  onChange: (value: EidosFileFilterValue | EidosFileFilterValue[]) => void
}) {
  const { translate: t } = useEidosFileUI()
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
            key={option.value}
            type="button"
            className={cn(
              "rounded-md border p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground",
              selected.has(option.value) &&
                "border-foreground/20 bg-secondary text-foreground"
            )}
            onClick={() => {
              const next = new Set(selected)
              if (next.has(option.value)) next.delete(option.value)
              else next.add(option.value)
              onChange([...next] as EidosFileFilterValue[])
            }}
          >
            <SelectOptionItem option={option} className="max-w-[180px]" />
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
          <SelectValue placeholder={t("Choose option")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <SelectOptionItem option={option} className="max-w-[190px]" />
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
          <SelectItem value="true">{t("Checked")}</SelectItem>
          <SelectItem value="false">{t("Unchecked")}</SelectItem>
        </SelectContent>
      </Select>
    )
  }
  if (displayType === "date" || displayType === "datetime") {
    const rawValue = Array.isArray(rule.value)
      ? (rule.value[0] ?? "")
      : (rule.value ?? "")
    return (
      <Input
        className="h-7 min-w-0 text-xs"
        type={displayType === "date" ? "date" : "datetime-local"}
        step={displayType === "datetime" ? 1 : undefined}
        value={
          displayType === "datetime"
            ? datetimeLocalFromFilterInstant(rawValue)
            : String(rawValue)
        }
        placeholder={t("Value")}
        onChange={(event) => {
          if (displayType === "datetime") {
            onChange(
              event.target.value
                ? filterInstantFromDatetimeLocal(event.target.value)
                : ""
            )
          } else {
            onChange(event.target.value)
          }
        }}
      />
    )
  }
  return (
    <Input
      className="h-7 min-w-0 text-xs"
      type={
        displayType === "number" || displayType === "rating" ? "number" : "text"
      }
      value={String(
        Array.isArray(rule.value) ? (rule.value[0] ?? "") : (rule.value ?? "")
      )}
      placeholder={t("Value")}
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

function countFilterRules(group: EidosFileFilterGroup): number {
  return group.children.reduce(
    (count, child) =>
      count + (child.type === "rule" ? 1 : countFilterRules(child)),
    0
  )
}

function EidosFileFilterRuleEditor({
  fields,
  rule,
  onChange,
  onRemove,
}: {
  fields: EidosFileFieldInfo[]
  rule: EidosFileFilterRule
  onChange: (rule: EidosFileFilterRule) => void
  onRemove: () => void
}) {
  const { translate: t } = useEidosFileUI()
  const field =
    fields.find((candidate) => eidosFileFieldKey(candidate) === rule.field) ??
    fields[0]
  if (!field) return null
  return (
    <div className="grid grid-cols-[110px_150px_minmax(120px,1fr)_28px] items-start gap-1.5">
      <Select
        value={eidosFileFieldKey(field)}
        onValueChange={(fieldId) => {
          const nextField = fields.find(
            (candidate) => eidosFileFieldKey(candidate) === fieldId
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
              key={eidosFileFieldKey(candidate)}
              value={eidosFileFieldKey(candidate)}
            >
              {eidosFileFieldDisplayName(candidate)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={rule.operator}
        onValueChange={(operator: EidosFileFilterOperator) =>
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
              {t(operatorLabels[operator])}
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
        aria-label={t("Remove filter")}
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function EidosFileFilterAddMenu({
  canAddGroup,
  onAddRule,
  onAddGroup,
}: {
  canAddGroup: boolean
  onAddRule: () => void
  onAddGroup: () => void
}) {
  const { translate: t } = useEidosFileUI()
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
          {t("Add filter")}
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
          {t("Add condition")}
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
            {t("Add group")}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function EidosFileFilterGroupEditor({
  fields,
  group,
  depth,
  onChange,
}: {
  fields: EidosFileFieldInfo[]
  group: EidosFileFilterGroup
  depth: number
  onChange: (group: EidosFileFilterGroup) => void
}) {
  const { translate: t } = useEidosFileUI()
  const updateChild = (
    index: number,
    child: EidosFileFilterRule | EidosFileFilterGroup
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
          {depth === 0 ? t("Show rows where") : t("Group where")}
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
            <SelectItem value="and">{t("All match")}</SelectItem>
            <SelectItem value="or">{t("Any match")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        {group.children.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            {t("No conditions in this group.")}
          </p>
        ) : null}
        {group.children.map((child, index) =>
          child.type === "rule" ? (
            <EidosFileFilterRuleEditor
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
              <EidosFileFilterGroupEditor
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
                aria-label={t("Remove filter group")}
                onClick={() => removeChild(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        )}
      </div>
      <EidosFileFilterAddMenu
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

function EidosFileFilterPopover({
  fields,
  value,
  disabled,
  onChange,
}: {
  fields: EidosFileFieldInfo[]
  value: EidosFileFilterGroup | null
  disabled?: boolean
  onChange: (filter: EidosFileFilterGroup | null) => Promise<void> | void
}) {
  const { translate: t } = useEidosFileUI()
  const availableFields = useMemo(() => filterableFields(fields), [fields])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<EidosFileFilterGroup>(
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
    next: EidosFileFilterGroup | null,
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
          : t("Unable to update filters")
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
          className="eidos-file-workbar-action h-7 gap-1 px-2 text-xs"
          aria-label={t("Filter Eidos File rows")}
          title={t("Filter")}
          disabled={disabled || availableFields.length === 0}
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="eidos-file-workbar-action-label">{t("Filter")}</span>
          {value && countFilterRules(value) > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              {countFilterRules(value)}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-eidos-file-filter-popover
        align="end"
        className="max-h-[min(640px,calc(100vh-32px))] w-[680px] max-w-[calc(100vw-32px)] overflow-y-auto p-3"
        aria-busy={pendingAction ? "true" : undefined}
      >
        <fieldset
          disabled={Boolean(pendingAction)}
          className="m-0 min-w-0 border-0 p-0"
        >
          <EidosFileFilterGroupEditor
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
                  {pendingAction === "clear" ? t("Clearing…") : t("Clear")}
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
                {pendingAction === "apply" ? t("Applying…") : t("Apply")}
              </Button>
            </div>
          </div>
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}

function EidosFileSortPopover({
  fields,
  value,
  disabled,
  onChange,
}: {
  fields: EidosFileFieldInfo[]
  value: EidosFileSort[]
  disabled?: boolean
  onChange: (sorts: EidosFileSort[]) => Promise<void> | void
}) {
  const { translate: t } = useEidosFileUI()
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
  const commit = async (next: EidosFileSort[], action: "apply" | "clear") => {
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
          : t("Unable to update sorts")
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
          className="eidos-file-workbar-action h-7 gap-1 px-2 text-xs"
          aria-label={t("Sort Eidos File rows")}
          title={t("Sort")}
          disabled={disabled || availableFields.length === 0}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="eidos-file-workbar-action-label">{t("Sort")}</span>
          {value.length ? (
            <span className="text-[10px] text-muted-foreground">
              {value.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-eidos-file-sort-popover
        align="end"
        className="w-[360px] p-3"
        aria-busy={pendingAction ? "true" : undefined}
      >
        <fieldset
          disabled={Boolean(pendingAction)}
          className="m-0 min-w-0 border-0 p-0"
        >
          <div className="text-xs font-medium">{t("Sort this view")}</div>
          <div className="mt-2 space-y-1.5">
            {draft.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {t("Rows use their original order.")}
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
                    aria-label={t("Sort field {index}", { index: index + 1 })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((field) => (
                      <SelectItem
                        key={eidosFileFieldKey(field)}
                        value={eidosFileFieldKey(field)}
                        disabled={draft.some(
                          (candidate, candidateIndex) =>
                            candidateIndex !== index &&
                            candidate.field === eidosFileFieldKey(field)
                        )}
                      >
                        {eidosFileFieldDisplayName(field)}
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
                    aria-label={t("Sort direction {index}", {
                      index: index + 1,
                    })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">{t("Ascending")}</SelectItem>
                    <SelectItem value="desc">{t("Descending")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label={t("Remove sort")}
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
                  (candidate) => !used.has(eidosFileFieldKey(candidate))
                )
                if (field) {
                  setDraft((current) => [
                    ...current,
                    { field: eidosFileFieldKey(field), direction: "asc" },
                  ])
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("Add sort")}
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
                  {pendingAction === "clear" ? t("Clearing…") : t("Clear")}
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
                {pendingAction === "apply" ? t("Applying…") : t("Apply")}
              </Button>
            </div>
          </div>
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}

export function EidosFileQueryToolbar({
  fields,
  filter,
  sorts,
  search,
  disabled,
  focusSearchToken = 0,
  searchResultCount,
  searchResultIndex,
  onSearchChange,
  onNavigateSearch,
  onFilterChange,
  onSortsChange,
}: {
  fields: EidosFileFieldInfo[]
  filter: EidosFileFilterGroup | null
  sorts: EidosFileSort[]
  search: string
  disabled?: boolean
  focusSearchToken?: number
  searchResultCount?: number | null
  searchResultIndex?: number | null
  onSearchChange: (search: string) => void
  onNavigateSearch?: (direction: "next" | "previous") => void
  onFilterChange: (filter: EidosFileFilterGroup | null) => Promise<void> | void
  onSortsChange: (sorts: EidosFileSort[]) => Promise<void> | void
}) {
  const { translate: t } = useEidosFileUI()
  const searchNavigation = useEidosFileSearchNavigation()
  const resolvedSearchResultCount =
    searchResultCount === undefined
      ? (searchNavigation?.searchResultCount ?? null)
      : searchResultCount
  const resolvedSearchResultIndex =
    searchResultIndex === undefined
      ? (searchNavigation?.searchResultIndex ?? null)
      : searchResultIndex
  const navigateSearch =
    onNavigateSearch ?? searchNavigation?.navigateSearchResults
  const inputRef = useRef<HTMLInputElement>(null)
  const [showSearch, setShowSearch] = useState(Boolean(search))
  useEffect(() => {
    if (showSearch) inputRef.current?.focus()
  }, [showSearch])
  useEffect(() => {
    if (focusSearchToken <= 0) return
    setShowSearch(true)
    inputRef.current?.focus()
  }, [focusSearchToken])
  useEffect(() => {
    if (search) setShowSearch(true)
  }, [search])
  const hasSearch = search.trim().length > 0
  const hasResults =
    hasSearch &&
    resolvedSearchResultCount !== null &&
    resolvedSearchResultCount > 0
  const resultStatus = !hasSearch
    ? ""
    : resolvedSearchResultCount === null
      ? t("Searching")
      : resolvedSearchResultCount === 0
        ? t("No results")
        : t("{index} of {count}", {
            index: (resolvedSearchResultIndex ?? 0) + 1,
            count: resolvedSearchResultCount,
          })
  return (
    <div
      className="flex min-w-0 shrink-0 items-center gap-0.5"
      data-eidos-file-query-toolbar
    >
      {showSearch ? (
        <div className="eidos-file-workbar-search flex h-7 items-center rounded-md border bg-background pl-2 pr-1 shadow-xs">
          <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={search}
            placeholder={t("Search rows")}
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
                navigateSearch?.(event.shiftKey ? "previous" : "next")
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
            aria-label={t("Previous search result")}
            title={t("Previous result (Shift+Enter)")}
            disabled={!hasResults}
            onClick={() => navigateSearch?.("previous")}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-muted-foreground"
            aria-label={t("Next search result")}
            title={t("Next result (Enter)")}
            disabled={!hasResults}
            onClick={() => navigateSearch?.("next")}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-muted-foreground"
            aria-label={t("Close search")}
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
          className="eidos-file-workbar-action h-7 gap-1 px-2 text-xs"
          aria-label={t("Search Eidos File rows")}
          title={t("Search")}
          disabled={disabled}
          onClick={() => setShowSearch(true)}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="eidos-file-workbar-action-label">{t("Search")}</span>
        </Button>
      )}
      <EidosFileFilterPopover
        fields={fields}
        value={filter}
        disabled={disabled}
        onChange={onFilterChange}
      />
      <EidosFileSortPopover
        fields={fields}
        value={sorts}
        disabled={disabled}
        onChange={onSortsChange}
      />
    </div>
  )
}
