import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
  EidosFileFilterOperator,
  EidosFileFilterRule,
  EidosFileFilterRuleValue,
  EidosFileFilterValue,
  EidosFileSort,
} from "@eidos.space/eidos-file"
import {
  eidosFileFieldQueryCapabilities,
  EIDOS_FILE_CALENDAR_TIME_ZONE_DATA,
  isEidosFileCalendarPeriodValue,
  isEidosFileCalendarWindowValue,
} from "@eidos.space/eidos-file"
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronsUpDown,
  ChevronUp,
  ChevronRight,
  Filter,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"

import { cn } from "./lib/cn"
import { useEidosFileUI } from "./context"
import { useEidosFilePendingEdit } from "./use-pending-edit"
import { useEidosFileSearchNavigation } from "./eidos-file-search-navigation"
import { useEidosFileSearchFocus } from "./eidos-file-search-focus"
import { eidosFileResolvedTimeZone } from "./eidos-file-date-time"
import {
  EidosFileDateFilterValue,
  focusInvalidDateFilter,
} from "./eidos-file-date-filter-value"
import {
  Button,
  CommandGroup,
  CommandItem,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"

import type { EidosFileEditorDataSource } from "./data-source"
import { EidosFileCommandCombobox } from "./eidos-file-command-combobox"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/adaptive-popover"
import { EidosFileQueryRelationFilter } from "./eidos-file-query-relation-filter"

import {
  eidosFileFieldDisplayName,
  eidosFileFieldKey,
  isEidosFileRecordLabelField,
  isOptionalEidosFileSystemField,
} from "./eidos-file-field-visibility"
import { eidosFileSelectOptions } from "./eidos-file-field-properties"
import { SelectOptionItem } from "./ui/select-option-item"
import { eidosFileFieldTypeIcon } from "./eidos-file-field-type-picker"
import { Select as SelectPrimitive } from "radix-ui"

import { EidosFileRelativeDateControls } from "./eidos-file-relative-date-controls"
import { RelativeDatePreview } from "./eidos-file-relative-date-preview"

function FilterFieldIcon({ field }: { field: EidosFileFieldInfo }) {
  const Icon = eidosFileFieldTypeIcon(field.type)
  return Icon ? (
    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  ) : null
}

export interface EidosFileFilterEditorOptions {
  fieldGroup?: (field: EidosFileFieldInfo) => string
  getOperators?: (field: EidosFileFieldInfo) => EidosFileFilterOperator[]
  renderValue?: (
    field: EidosFileFieldInfo,
    rule: EidosFileFilterRule,
    onChange: (value: EidosFileFilterRuleValue) => void
  ) => ReactNode | undefined
}

function groupedFilterFields(
  fields: EidosFileFieldInfo[],
  fieldGroup?: EidosFileFilterEditorOptions["fieldGroup"]
) {
  const groups = new Map<string, EidosFileFieldInfo[]>()
  for (const field of fields) {
    const label = fieldGroup?.(field) ?? ""
    const group = groups.get(label) ?? []
    group.push(field)
    groups.set(label, group)
  }
  return [...groups].map(([label, fields]) => ({ label, fields }))
}

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
  "is-between": "is between",
  "is-relative-to-today": "Date filters need updating",
  "is-on-calendar-day": "Date filters need updating",
  "is-in-calendar-period": "Is relative to today",
  "is-in-calendar-window": "Is relative to today",
}

const emptyOperators = new Set<EidosFileFilterOperator>([
  "is-empty",
  "is-not-empty",
])

const multipleValueOperators = new Set<EidosFileFilterOperator>([
  "is-any-of",
  "is-all-of",
  "is-none-of",
])

const checkboxConditions: Array<{
  key: string
  label: string
  operator: EidosFileFilterOperator
  value?: boolean
}> = [
  { key: "checked", label: "Checked", operator: "equals", value: true },
  { key: "unchecked", label: "Unchecked", operator: "equals", value: false },
  { key: "empty", label: "is empty", operator: "is-empty" },
  { key: "not-empty", label: "is not empty", operator: "is-not-empty" },
  {
    key: "unchecked-or-empty",
    label: "Unchecked or empty",
    operator: "not-equals",
    value: true,
  },
  {
    key: "checked-or-empty",
    label: "Checked or empty",
    operator: "not-equals",
    value: false,
  },
]

function CheckboxConditionSelect({
  field,
  condition,
  conditions,
  source,
  onChange,
}: {
  field: EidosFileFieldInfo
  condition: (typeof checkboxConditions)[number]
  conditions: typeof checkboxConditions
  source?: EidosFileEditorDataSource
  onChange: (condition: (typeof checkboxConditions)[number]) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [open, setOpen] = useState(false)
  const [nullCheck, setNullCheck] = useState<{
    field: EidosFileFieldInfo
    source: EidosFileEditorDataSource
    hasNull: boolean
  } | null>(null)
  useEffect(() => {
    if (!open || !source || !field.tableId || field.nullable === false) return
    let active = true
    void (async () => {
      const fieldId = eidosFileFieldKey(field)
      const hasNull = source.hasNullValues
        ? await source.hasNullValues(field.tableId!, fieldId)
        : (
            await source.calculateColumnStats(
              field.tableId!,
              [{ fieldId, type: "count-empty" }],
              {}
            )
          ).some(
            (stat) =>
              stat.fieldId === fieldId &&
              stat.type === "count-empty" &&
              Number(stat.value) > 0
          )
      if (active) setNullCheck({ field, source, hasNull })
    })().catch(() => {
      // Ordinary Boolean choices and the saved condition remain usable when
      // the optional null-presence check is unavailable.
    })
    return () => {
      active = false
    }
  }, [open, source, field])
  const hasNull =
    field.nullable !== false &&
    nullCheck?.field === field &&
    nullCheck.source === source &&
    nullCheck.hasNull
  const visibleConditions = conditions.filter(
    (candidate) =>
      candidate.operator === "equals" ||
      hasNull ||
      candidate.key === condition.key
  )
  return (
    <Select
      open={open}
      onOpenChange={(next) => {
        if (next) setNullCheck(null)
        setOpen(next)
      }}
      value={condition.key}
      onValueChange={(key) => {
        const next = visibleConditions.find(
          (candidate) => candidate.key === key
        )
        if (next) onChange(next)
      }}
    >
      <SelectTrigger
        className="h-7 min-w-0 text-xs"
        aria-label={t("Checkbox condition")}
      >
        <SelectValue>{t(condition.label)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {visibleConditions.map((candidate) => (
          <SelectItem key={candidate.key} value={candidate.key}>
            {t(candidate.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export const eidosFileCalendarPeriodOptions = [
  { unit: "day", offset: -1, label: "Yesterday" },
  { unit: "day", offset: 0, label: "Today" },
  { unit: "day", offset: 1, label: "Tomorrow" },
  { unit: "week", offset: -1, label: "Last week" },
  { unit: "week", offset: 0, label: "This week" },
  { unit: "week", offset: 1, label: "Next week" },
  { unit: "month", offset: -1, label: "Last month" },
  { unit: "month", offset: 0, label: "This month" },
  { unit: "month", offset: 1, label: "Next month" },
  { unit: "year", offset: -1, label: "Last year" },
  { unit: "year", offset: 0, label: "This year" },
  { unit: "year", offset: 1, label: "Next year" },
] as const

function configuredCalendarTimeZone(timeZone?: string): string {
  return eidosFileResolvedTimeZone(timeZone === "system" ? undefined : timeZone)
}

function queryCandidateFields(fields: EidosFileFieldInfo[]) {
  return fields.filter(
    (field) =>
      isOptionalEidosFileSystemField(field) ||
      (!field.isHidden &&
        (isEidosFileRecordLabelField(field) ||
          field.valueKind === "source" ||
          field.valueKind === "relation" ||
          field.valueKind === "materialized" ||
          field.valueKind === "derived"))
  )
}

function filterableFields(fields: EidosFileFieldInfo[]) {
  return queryCandidateFields(fields).filter(
    (field) => eidosFileFieldQueryCapabilities(field).filterOperators.length > 0
  )
}

function sortableFields(fields: EidosFileFieldInfo[]) {
  return queryCandidateFields(fields).filter(
    (field) => eidosFileFieldQueryCapabilities(field).sortPosition === "any"
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
  return [...eidosFileFieldQueryCapabilities(field).filterOperators]
}

function operatorLabel(
  field: EidosFileFieldInfo,
  operator: EidosFileFilterOperator
): string {
  const displayType = fieldDisplayType(field)
  if (displayType === "date" || displayType === "datetime") {
    const labels: Partial<Record<EidosFileFilterOperator, string>> = {
      equals: "is",
      "less-than": "is before",
      "greater-than": "is after",
      "less-than-or-equal": "is on or before",
      "greater-than-or-equal": "is on or after",
    }
    return labels[operator] ?? operatorLabels[operator]
  }
  return operatorLabels[operator]
}

function fieldOptions(field: EidosFileFieldInfo) {
  return eidosFileSelectOptions(field)
}

function defaultRule(
  field: EidosFileFieldInfo,
  getOperators = operatorsForField
): EidosFileFilterRule {
  return {
    type: "rule",
    field: eidosFileFieldKey(field),
    operator: getOperators(field)[0] ?? "equals",
    value: fieldDisplayType(field) === "checkbox" ? true : "",
  }
}

function FilterTextInput({
  value,
  onChange,
  numeric,
}: {
  value: string
  onChange(value: string): void
  numeric: boolean
}) {
  const { translate: t } = useEidosFileUI()
  const [draft, setDraft] = useState(value)
  const composing = useRef(false)
  useEffect(() => {
    if (!composing.current) setDraft(value)
  }, [value])
  return (
    <Input
      autoFocus
      className="h-7 min-w-0 text-xs"
      type={numeric ? "number" : "text"}
      value={draft}
      placeholder={t("Value")}
      aria-label={t("Value")}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(event) => {
        composing.current = false
        setDraft(event.currentTarget.value)
        onChange(event.currentTarget.value)
      }}
      onChange={(event) => {
        setDraft(event.target.value)
        if (!composing.current) onChange(event.target.value)
      }}
    />
  )
}

function FilterValueEditor({
  field,
  rule,
  source,
  compact = false,
  inlineDatePicker = false,
  onRuleChange,
  onChange,
}: {
  field: EidosFileFieldInfo
  rule: EidosFileFilterRule
  source?: EidosFileEditorDataSource
  compact?: boolean
  inlineDatePicker?: boolean
  onRuleChange?: (rule: EidosFileFilterRule) => void
  onChange: (value: EidosFileFilterRuleValue) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [optionsOpen, setOptionsOpen] = useState(false)
  if (emptyOperators.has(rule.operator)) return null
  const displayType = fieldDisplayType(field)
  const options = fieldOptions(field)
  if (field.type === "relation" && source) {
    return (
      <EidosFileQueryRelationFilter
        field={field}
        source={source}
        value={rule.value}
        multiple={multipleValueOperators.has(rule.operator)}
        onChange={onChange}
      />
    )
  }
  if (
    rule.operator === "is-in-calendar-period" ||
    rule.operator === "is-in-calendar-window"
  ) {
    const period = isEidosFileCalendarPeriodValue(rule.value)
      ? rule.value
      : undefined
    const window = isEidosFileCalendarWindowValue(rule.value)
      ? rule.value
      : undefined
    const legacy = !!period && period.offset !== 0
    const selection = window ?? {
      direction:
        period?.offset === -1
          ? ("past" as const)
          : period?.offset === 1
            ? ("next" as const)
            : ("this" as const),
      count: 1,
      unit: period?.unit ?? "day",
    }
    return (
      <fieldset
        disabled={!!window && !onRuleChange}
        className="m-0 min-w-0 border-0 p-0"
      >
        <EidosFileRelativeDateControls
          value={selection}
          legacyPeriod={legacy || (!onRuleChange && !window)}
          onChange={(value) => {
            if (legacy || !onRuleChange || value.direction === "this") {
              const offset: -1 | 0 | 1 =
                value.direction === "past"
                  ? -1
                  : value.direction === "next"
                    ? 1
                    : 0
              const next = {
                ...rule,
                operator: "is-in-calendar-period" as const,
                value: { unit: value.unit, offset },
              }
              if (onRuleChange) onRuleChange(next)
              else onChange(next.value)
            } else
              onRuleChange({
                ...rule,
                operator: "is-in-calendar-window",
                value: {
                  direction: value.direction,
                  count: value.count,
                  unit: value.unit,
                },
              })
          }}
        />
      </fieldset>
    )
  }
  if (
    field.type === "multi-select" &&
    multipleValueOperators.has(rule.operator)
  ) {
    const selected = new Set(Array.isArray(rule.value) ? rule.value : [])
    return (
      <div
        className={cn(
          "flex max-w-[320px] flex-wrap gap-1 pt-1",
          !compact && "col-span-full ml-[116px]"
        )}
      >
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
    const currentValue = String(
      Array.isArray(rule.value) ? (rule.value[0] ?? "") : (rule.value ?? "")
    )
    const selectedOption = options.find(
      (option) => option.value === currentValue
    )
    return (
      <EidosFileCommandCombobox
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        searchPlaceholder={t("Search options…")}
        emptyText={t("No results")}
        contentClassName="w-[220px]"
        trigger={
          <button
            type="button"
            role="combobox"
            aria-expanded={optionsOpen}
            className={cn(
              "flex h-7 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none",
              !selectedOption && "text-muted-foreground"
            )}
          >
            <span className="min-w-0 truncate">
              {selectedOption ? (
                <SelectOptionItem
                  option={selectedOption}
                  className="max-w-[190px]"
                />
              ) : (
                t("Choose option")
              )}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </button>
        }
      >
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              onSelect={() => {
                onChange(option.value)
                setOptionsOpen(false)
              }}
              className="text-xs"
            >
              <SelectOptionItem option={option} className="max-w-[170px]" />
              {option.value === currentValue && (
                <Check className="ml-auto h-3.5 w-3.5" />
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </EidosFileCommandCombobox>
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
    return (
      <EidosFileDateFilterValue
        key={rule.operator}
        type={displayType}
        value={rule.value}
        range={rule.operator === "is-between"}
        inline={inlineDatePicker}
        onChange={onChange}
      />
    )
  }
  return (
    <FilterTextInput
      numeric={displayType === "number" || displayType === "rating"}
      value={String(
        Array.isArray(rule.value) ? (rule.value[0] ?? "") : (rule.value ?? "")
      )}
      onChange={(value) =>
        onChange(
          displayType === "number" || displayType === "rating"
            ? value === ""
              ? ""
              : Number(value)
            : value
        )
      }
    />
  )
}

const MAX_FILTER_GROUP_DEPTH = 2

function countFilterNodes(group: EidosFileFilterGroup): number {
  return (
    1 +
    group.children.reduce(
      (count, child) =>
        count + (child.type === "group" ? countFilterNodes(child) : 1),
      0
    )
  )
}

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
  source,
  fixedField = false,
  onChange,
  onRemove,
  getOperators = operatorsForField,
  renderValue,
  fieldGroup,
}: {
  fields: EidosFileFieldInfo[]
  rule: EidosFileFilterRule
  source?: EidosFileEditorDataSource
  fixedField?: boolean
  onChange: (rule: EidosFileFilterRule) => void
  onRemove?: () => void
} & EidosFileFilterEditorOptions) {
  const {
    translate: t,
    calendarTimeZoneData,
    calendarPeriodTimeZoneData,
    calendarWindowVersion,
  } = useEidosFileUI()
  const field = fields.find(
    (candidate) => eidosFileFieldKey(candidate) === rule.field
  )
  if (!field)
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {t("Filtered property unavailable")}
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t("Remove filter")}
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    )
  const customValue = renderValue?.(field, rule, (value) =>
    onChange({ ...rule, value })
  )
  const operators = getOperators(field)
  const availableOperators = operators.filter(
    (operator) =>
      operator !== "is-in-calendar-window" &&
      (operator !== "is-in-calendar-period" ||
        rule.operator === operator ||
        calendarPeriodTimeZoneData?.includes(
          calendarTimeZoneData ?? EIDOS_FILE_CALENDAR_TIME_ZONE_DATA
        ))
  )
  const conditions = checkboxConditions.filter((condition) =>
    availableOperators.includes(condition.operator)
  )
  const checkboxCondition =
    fieldDisplayType(field) === "checkbox" && customValue == null
      ? conditions.find(
          (condition) =>
            condition.operator === rule.operator &&
            (emptyOperators.has(rule.operator) ||
              condition.value === rule.value)
        )
      : undefined
  const legacyPeriod =
    rule.operator === "is-in-calendar-period" &&
    isEidosFileCalendarPeriodValue(rule.value) &&
    rule.value.offset !== 0
  const relative =
    rule.operator === "is-in-calendar-window" ||
    (rule.operator === "is-in-calendar-period" && !legacyPeriod)
  return (
    <div
      data-relative-rule={relative || legacyPeriod || undefined}
      data-absolute-date-rule={
        (fixedField &&
          !relative &&
          !legacyPeriod &&
          ["date", "datetime"].includes(fieldDisplayType(field))) ||
        undefined
      }
      className={cn(
        "grid items-start gap-1.5",
        fixedField
          ? "grid-cols-1"
          : checkboxCondition
            ? "eidos-filter-rule eidos-filter-checkbox-rule"
            : "eidos-filter-rule"
      )}
    >
      {!fixedField && (
        <Select
          value={eidosFileFieldKey(field)}
          onValueChange={(fieldId) => {
            const nextField = fields.find(
              (candidate) => eidosFileFieldKey(candidate) === fieldId
            )
            if (nextField) onChange(defaultRule(nextField, getOperators))
          }}
        >
          <SelectTrigger
            className="h-7 min-w-0 gap-1 text-xs [&>span]:min-w-0 [&>span]:truncate"
            aria-label={t("Field")}
            data-eidos-file-filter-field
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupedFilterFields(fields, fieldGroup).map((group) => (
              <SelectPrimitive.Group key={group.label}>
                {group.label && (
                  <SelectPrimitive.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </SelectPrimitive.Label>
                )}
                {group.fields.map((candidate) => (
                  <SelectItem
                    key={eidosFileFieldKey(candidate)}
                    value={eidosFileFieldKey(candidate)}
                  >
                    <span className="inline-flex max-w-full items-center gap-1.5">
                      <FilterFieldIcon field={candidate} />
                      <span className="truncate">
                        {eidosFileFieldDisplayName(candidate)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectPrimitive.Group>
            ))}
          </SelectContent>
        </Select>
      )}
      {checkboxCondition ? (
        <div
          className="min-w-0"
          data-eidos-file-filter-value={fixedField ? "" : undefined}
        >
          <CheckboxConditionSelect
            field={field}
            source={source}
            condition={checkboxCondition}
            conditions={conditions}
            onChange={(condition) =>
              onChange({
                ...rule,
                operator: condition.operator,
                value: condition.value,
              })
            }
          />
        </div>
      ) : (
        <>
          <Select
            value={relative ? "relative-date" : rule.operator}
            onValueChange={(selected: string) => {
              const operator = (
                selected === "relative-date"
                  ? "is-in-calendar-period"
                  : selected
              ) as EidosFileFilterOperator
              const relative = operator === "is-in-calendar-period"
              const between = operator === "is-between"
              const membership =
                eidosFileFieldQueryCapabilities(field).membership
              const multiple =
                membership && multipleValueOperators.has(operator)
              const currentIsStructured =
                rule.value !== null &&
                typeof rule.value === "object" &&
                !Array.isArray(rule.value)
              const nextValue: EidosFileFilterRuleValue | undefined =
                emptyOperators.has(operator)
                  ? undefined
                  : relative
                    ? { unit: "day", offset: 0 }
                    : between
                      ? ["", ""]
                      : multiple
                        ? Array.isArray(rule.value)
                          ? rule.value
                          : typeof rule.value === "string" && rule.value
                            ? [rule.value]
                            : []
                        : membership && Array.isArray(rule.value)
                          ? (rule.value[0] ?? "")
                          : rule.value === undefined || currentIsStructured
                            ? fieldDisplayType(field) === "checkbox"
                              ? true
                              : ""
                            : rule.value
              onChange({
                ...rule,
                operator,
                value: nextValue,
              })
            }}
          >
            <SelectTrigger
              className="h-auto min-h-7 min-w-0 gap-1 px-2 py-1 text-left text-xs [&>span]:min-w-0 [&>span]:whitespace-normal [&>span]:leading-4 [&>svg]:shrink-0"
              aria-label={t("Filter operator")}
            >
              <SelectValue>
                {fixedField && relative
                  ? `${eidosFileFieldDisplayName(field)} ${t("is relative to today")}`
                  : fixedField &&
                      ["date", "datetime"].includes(fieldDisplayType(field))
                    ? `${eidosFileFieldDisplayName(field)} ${t(operatorLabel(field, rule.operator))}`
                    : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availableOperators.map((operator) => (
                <SelectItem
                  key={operator}
                  value={
                    operator === "is-in-calendar-period"
                      ? "relative-date"
                      : operator
                  }
                >
                  {t(operatorLabel(field, operator))}
                </SelectItem>
              ))}
              {legacyPeriod && (
                <SelectItem value="is-in-calendar-period">
                  {t("In a calendar period")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <div
            className={fixedField ? "min-w-0" : "eidos-filter-value"}
            data-eidos-file-filter-value={fixedField ? "" : undefined}
          >
            {customValue ?? (
              <FilterValueEditor
                field={field}
                rule={rule}
                source={source}
                compact
                inlineDatePicker={fixedField}
                onRuleChange={
                  calendarWindowVersion === 1 &&
                  operators.includes("is-in-calendar-window")
                    ? onChange
                    : undefined
                }
                onChange={(value) => onChange({ ...rule, value })}
              />
            )}
          </div>
        </>
      )}
      {fixedField && (relative || legacyPeriod) && (
        <RelativeDatePreview rule={rule} />
      )}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="eidos-filter-remove h-7 w-7 text-muted-foreground"
          aria-label={t("Remove filter")}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

function directFieldFilterRuleIndex(
  value: EidosFileFilterGroup | null,
  field: EidosFileFieldInfo
): number {
  if (value?.conjunction !== "and") return -1
  const fieldKey = eidosFileFieldKey(field)
  const matching = value.children.flatMap((child, index) =>
    child.type === "rule" && child.field === fieldKey ? [index] : []
  )
  return matching.length === 1 ? matching[0]! : -1
}

export function EidosFileFieldFilterEditor({
  field,
  value,
  source,
  disabled = false,
  onChange,
  onClose,
  onBack,
  onPendingChange,
}: {
  field: EidosFileFieldInfo
  value: EidosFileFilterGroup | null
  source?: EidosFileEditorDataSource
  disabled?: boolean
  onChange: (filter: EidosFileFilterGroup) => Promise<void> | void
  onClose: () => void
  onBack: () => void
  onPendingChange?: (pending: boolean) => void
}) {
  const { translate: t } = useEidosFileUI()
  useEidosFilePendingEdit(true)
  const editorRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<EidosFileFilterRule>(() => {
    const index = directFieldFilterRuleIndex(value, field)
    const current = index >= 0 ? value?.children[index] : undefined
    return current?.type === "rule" ? current : defaultRule(field)
  })
  const [pending, setPending] = useState(false)
  const relative =
    draft.operator === "is-in-calendar-period" ||
    draft.operator === "is-in-calendar-window"
  const dateKind = fieldDisplayType(field)
  const absoluteDate =
    !relative && (dateKind === "date" || dateKind === "datetime")
  const draftRef = useRef(draft)
  const valueRef = useRef(value)
  valueRef.current = value
  const pendingRef = useRef(false)
  const lifecycleRef = useRef({ active: false, generation: 0 })
  const callbacksRef = useRef({ onClose, onPendingChange })
  callbacksRef.current = { onClose, onPendingChange }
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const lifecycle = lifecycleRef.current
    lifecycle.active = true
    lifecycle.generation += 1
    const valueControl = editorRef.current?.querySelector<HTMLElement>(
      '[data-eidos-file-filter-value] input, [data-eidos-file-filter-value] button[role="combobox"]'
    )
    const operatorControl = editorRef.current?.querySelector<HTMLElement>(
      'button[role="combobox"]'
    )
    ;(valueControl ?? operatorControl)?.focus({ preventScroll: true })
    return () => {
      lifecycle.active = false
      lifecycle.generation += 1
      if (pendingRef.current) {
        pendingRef.current = false
        callbacksRef.current.onPendingChange?.(false)
      }
    }
  }, [])
  const commit = async (nextDraft = draft, close = true) => {
    if (disabled || pendingRef.current || !lifecycleRef.current.active) return
    if (focusInvalidDateFilter(editorRef.current)) return
    const generation = lifecycleRef.current.generation
    const isActive = () =>
      lifecycleRef.current.active &&
      lifecycleRef.current.generation === generation
    pendingRef.current = true
    setPending(true)
    callbacksRef.current.onPendingChange?.(true)
    setError(null)
    try {
      const value = valueRef.current
      const index = directFieldFilterRuleIndex(value, field)
      const next: EidosFileFilterGroup =
        value?.conjunction === "and"
          ? {
              ...value,
              children:
                index >= 0
                  ? value.children.map((child, childIndex) =>
                      childIndex === index ? nextDraft : child
                    )
                  : [...value.children, nextDraft],
            }
          : {
              type: "group",
              conjunction: "and",
              children: value ? [value, nextDraft] : [nextDraft],
            }
      await onChange(next)
      valueRef.current = next
      if (isActive() && close) callbacksRef.current.onClose()
    } catch (changeError) {
      if (isActive()) {
        setError(
          changeError instanceof Error
            ? changeError.message
            : t("Unable to update filters")
        )
      }
    } finally {
      if (isActive()) {
        pendingRef.current = false
        setPending(false)
        callbacksRef.current.onPendingChange?.(false)
        if (!close && draftRef.current !== nextDraft)
          void commit(draftRef.current, false)
      }
    }
  }
  return (
    <div
      ref={editorRef}
      className={cn(
        "max-w-full p-3",
        draft.operator === "is-in-calendar-period" ||
          draft.operator === "is-in-calendar-window"
          ? "eidos-relative-date-panel"
          : absoluteDate
            ? "eidos-absolute-date-panel"
            : "w-80"
      )}
      data-date-kind={absoluteDate ? dateKind : undefined}
      aria-busy={pending || undefined}
    >
      <fieldset
        disabled={pending && !relative}
        className="m-0 min-w-0 border-0 p-0"
      >
        {relative && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="eidos-relative-date-more"
                aria-label={t("More actions")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1" align="end">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                onClick={onBack}
              >
                <ChevronLeft className="h-4 w-4" />
                {t("Back")}
              </button>
              <button
                type="button"
                disabled={disabled || pending}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                onClick={async () => {
                  const current = valueRef.current
                  const index = directFieldFilterRuleIndex(current, field)
                  if (current && index >= 0) {
                    try {
                      await onChange({
                        ...current,
                        children: current.children.filter(
                          (_, childIndex) => childIndex !== index
                        ),
                      })
                      onClose()
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : t("Unable to update filters")
                      )
                    }
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                {t("Remove filter")}
              </button>
            </PopoverContent>
          </Popover>
        )}
        {absoluteDate && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="eidos-absolute-date-back"
            aria-label={t("Back")}
            onClick={onBack}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        )}
        {!relative && !absoluteDate && (
          <div className="mb-3 flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={t("Back")}
              onClick={onBack}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">{t("Filter")}</p>
              <h3 className="truncate text-xs font-medium">
                {eidosFileFieldDisplayName(field)}
              </h3>
            </div>
          </div>
        )}
        <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
          <EidosFileFilterRuleEditor
            key={disabled ? "disabled" : "enabled"}
            fields={[field]}
            fixedField
            rule={draft}
            source={source}
            onChange={(next) => {
              draftRef.current = next
              setDraft(next)
              if (
                next.operator === "is-in-calendar-period" ||
                next.operator === "is-in-calendar-window"
              )
                void commit(next, false)
            }}
          />
        </fieldset>
        {error ? (
          <p className="mt-3 break-words text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {!relative && (
          <div className="eidos-field-filter-footer mt-3 flex justify-end gap-1.5 border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onClose}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={disabled}
              onClick={() => void commit()}
            >
              {pending ? (
                <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
              ) : null}
              {t(pending ? "Applying…" : "Apply")}
            </Button>
          </div>
        )}
      </fieldset>
    </div>
  )
}

function EidosFileFilterAddMenu({
  fields,
  fieldGroup,
  empty,
  canAddGroup,
  onAddRule,
  onAddGroup,
}: {
  fields: EidosFileFieldInfo[]
  fieldGroup?: EidosFileFilterEditorOptions["fieldGroup"]
  empty: boolean
  canAddGroup: boolean
  onAddRule: (field: EidosFileFieldInfo) => void
  onAddGroup: (field: EidosFileFieldInfo) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [open, setOpen] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const choices = (
    <Command key={addingGroup ? "group" : "condition"}>
      {addingGroup && (
        <div className="flex items-center gap-1 border-b px-1 py-1 text-xs">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t("Back")}
            onClick={() => setAddingGroup(false)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          {t("Add group")}
        </div>
      )}
      <CommandInput
        autoFocus
        placeholder={t("Find a field…")}
        className="h-8 text-xs"
      />
      <CommandList>
        <CommandEmpty>{t("No results")}</CommandEmpty>
        {groupedFilterFields(fields, fieldGroup).map((group) => (
          <CommandGroup
            key={group.label}
            heading={group.label || undefined}
            className={
              group.label
                ? "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                : undefined
            }
          >
            {group.fields.map((field) => (
              <CommandItem
                key={eidosFileFieldKey(field)}
                value={eidosFileFieldKey(field)}
                keywords={[eidosFileFieldDisplayName(field)]}
                onSelect={() => {
                  if (addingGroup) onAddGroup(field)
                  else onAddRule(field)
                  setAddingGroup(false)
                  setOpen(false)
                }}
                className="gap-2 text-xs"
              >
                <FilterFieldIcon field={field} />
                <span className="truncate">
                  {eidosFileFieldDisplayName(field)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {canAddGroup && !addingGroup && (
          <CommandGroup>
            <CommandItem
              value="add-filter-group"
              keywords={[t("Add group")]}
              onSelect={() => {
                setAddingGroup(true)
              }}
              className="gap-2 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("Add group")}
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
  if (empty) return choices
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setAddingGroup(false)
      }}
    >
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
      <PopoverContent align="start" className="w-64 p-0">
        {choices}
      </PopoverContent>
    </Popover>
  )
}

export function EidosFileFilterGroupEditor({
  fields,
  group,
  depth,
  source,
  onChange,
  getOperators = operatorsForField,
  renderValue,
  fieldGroup,
  canAdd = true,
}: {
  fields: EidosFileFieldInfo[]
  group: EidosFileFilterGroup
  depth: number
  source?: EidosFileEditorDataSource
  onChange: (group: EidosFileFilterGroup) => void
  canAdd?: boolean
} & EidosFileFilterEditorOptions) {
  const { translate: t } = useEidosFileUI()
  const allowAdd = canAdd && countFilterNodes(group) < 64
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
  return (
    <div
      className={cn(
        "eidos-filter-group space-y-2",
        depth > 0 && "rounded-md border bg-muted/20 p-2"
      )}
    >
      {group.children.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t(depth === 0 ? "Match conditions" : "Group where")}
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
      )}
      <div className="space-y-2">
        {group.children.map((child, index) =>
          child.type === "rule" ? (
            <EidosFileFilterRuleEditor
              key={`rule-${index}-${child.field}`}
              fields={fields}
              rule={child}
              source={source}
              getOperators={getOperators}
              renderValue={renderValue}
              fieldGroup={fieldGroup}
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
                source={source}
                getOperators={getOperators}
                renderValue={renderValue}
                fieldGroup={fieldGroup}
                canAdd={allowAdd}
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
      {allowAdd && (
        <EidosFileFilterAddMenu
          fields={fields}
          fieldGroup={fieldGroup}
          empty={depth === 0 && group.children.length === 0}
          canAddGroup={
            depth < MAX_FILTER_GROUP_DEPTH && countFilterNodes(group) < 63
          }
          onAddRule={(field) => {
            onChange({
              ...group,
              children: [...group.children, defaultRule(field, getOperators)],
            })
          }}
          onAddGroup={(field) => {
            onChange({
              ...group,
              children: [
                ...group.children,
                {
                  type: "group",
                  conjunction: "and",
                  children: [defaultRule(field, getOperators)],
                },
              ],
            })
          }}
        />
      )}
    </div>
  )
}

export function EidosFileFilterPopover({
  fields,
  value,
  disabled,
  source,
  onChange,
}: {
  fields: EidosFileFieldInfo[]
  value: EidosFileFilterGroup | null
  disabled?: boolean
  source?: EidosFileEditorDataSource
  onChange: (filter: EidosFileFilterGroup | null) => Promise<void> | void
}) {
  const { translate: t, interactionMode } = useEidosFileUI()
  const mobile = interactionMode === "mobile"
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
  useEidosFilePendingEdit(open || pendingAction !== null)
  const editorRef = useRef<HTMLDivElement>(null)
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
    if (action === "apply" && focusInvalidDateFilter(editorRef.current)) return
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
          {mobile && <ChevronRight className="ml-auto h-4 w-4" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={editorRef}
        data-eidos-file-filter-popover
        aria-label={t("Filter")}
        align="end"
        className={cn(
          "max-h-[min(640px,calc(100vh-32px))] max-w-[calc(100vw-32px)] overflow-y-auto",
          draft.children.length ? "w-[560px] p-3" : "w-64 p-1"
        )}
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
            source={source}
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
          {(draft.children.length > 0 || value) && (
            <div className="eidos-query-footer mt-3 flex justify-end border-t pt-3">
              <div className="flex gap-1.5">
                {value || mobile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() =>
                      mobile
                        ? setDraft({
                            type: "group",
                            conjunction: "and",
                            children: [],
                          })
                        : void commit(null, "clear")
                    }
                  >
                    {pendingAction === "clear" ? (
                      <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                    ) : null}
                    {pendingAction === "clear"
                      ? t("Clearing…")
                      : t(mobile ? "Reset" : "Clear")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() =>
                    void commit(
                      draft.children.length > 0 ? draft : null,
                      "apply"
                    )
                  }
                >
                  {pendingAction === "apply" ? (
                    <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {pendingAction === "apply"
                    ? t("Applying…")
                    : t(mobile ? "Apply filters" : "Apply")}
                </Button>
              </div>
            </div>
          )}
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}

export function EidosFileSortPopover({
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
  const { translate: t, interactionMode } = useEidosFileUI()
  const availableFields = useMemo(() => sortableFields(fields), [fields])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [pendingAction, setPendingAction] = useState<"apply" | "clear" | null>(
    null
  )
  const pendingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  useEidosFilePendingEdit(open || pendingAction !== null)
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
          {interactionMode === "mobile" && (
            <ChevronRight className="ml-auto h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-eidos-file-sort-popover
        aria-label={t("Sort")}
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
          <div className="eidos-query-footer mt-3 flex items-center justify-between border-t pt-3">
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
  source,
  disabled,
  mutationsDisabled,
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
  source?: EidosFileEditorDataSource
  disabled?: boolean
  mutationsDisabled?: boolean
  focusSearchToken?: number
  searchResultCount?: number | null
  searchResultIndex?: number | null
  onSearchChange: (search: string) => void
  onNavigateSearch?: (direction: "next" | "previous") => void
  onFilterChange: (filter: EidosFileFilterGroup | null) => Promise<void> | void
  onSortsChange: (sorts: EidosFileSort[]) => Promise<void> | void
}) {
  const { translate: t, queryEditingDisabled } = useEidosFileUI()
  const hasSearchableFields = useMemo(
    () =>
      queryCandidateFields(fields).some(
        (field) => eidosFileFieldQueryCapabilities(field).searchable
      ),
    [fields]
  )
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
  const searchFocus = useEidosFileSearchFocus()
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTriggerRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const pendingReturnFocusRef = useRef(false)
  const [showSearch, setShowSearch] = useState(Boolean(search))
  useEffect(() => {
    if (!showSearch) return
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      !inputRef.current?.parentElement?.contains(active)
    ) {
      returnFocusRef.current = active
    }
    inputRef.current?.focus()
  }, [showSearch])
  useLayoutEffect(() => {
    if (showSearch || !pendingReturnFocusRef.current) return
    pendingReturnFocusRef.current = false
    if (document.activeElement !== document.body) return
    const previous = returnFocusRef.current
    const target = previous?.isConnected ? previous : searchTriggerRef.current
    target?.focus({ preventScroll: true })
  }, [showSearch])
  const closeSearch = () => {
    onSearchChange("")
    setShowSearch(false)
    pendingReturnFocusRef.current = !searchFocus?.restoreFocus()
  }
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
        <div
          className="eidos-file-workbar-search flex h-7 items-center rounded-md border bg-background pl-2 pr-1 shadow-xs"
          onKeyDown={(event) => {
            if (
              event.key !== "Escape" ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            )
              return
            event.preventDefault()
            event.stopPropagation()
            closeSearch()
          }}
        >
          <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={search}
            placeholder={t("Search rows")}
            className="min-w-0 flex-1 bg-transparent text-xs outline-hidden placeholder:text-muted-foreground"
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229
              )
                return
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
            onClick={closeSearch}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          ref={searchTriggerRef}
          type="button"
          variant="ghost"
          size="sm"
          className="eidos-file-workbar-action h-7 gap-1 px-2 text-xs"
          aria-label={t("Search Eidos File rows")}
          title={t("Search")}
          disabled={disabled || !hasSearchableFields}
          onClick={() => setShowSearch(true)}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="eidos-file-workbar-action-label">{t("Search")}</span>
        </Button>
      )}
      <EidosFileFilterPopover
        fields={fields}
        value={filter}
        source={source}
        disabled={disabled || mutationsDisabled || queryEditingDisabled}
        onChange={onFilterChange}
      />
      <EidosFileSortPopover
        fields={fields}
        value={sorts}
        disabled={disabled || mutationsDisabled || queryEditingDisabled}
        onChange={onSortsChange}
      />
    </div>
  )
}
