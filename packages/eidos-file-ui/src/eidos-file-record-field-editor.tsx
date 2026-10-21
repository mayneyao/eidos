import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileMultiSelectValues,
  encodeEidosFileMultiSelectValues,
} from "@eidos.space/eidos-file"
import { Check, ChevronDown, ExternalLink, Plus, Star, X } from "lucide-react"

import { useEidosFileUI } from "./context"
import { Button, Input } from "./ui/primitives"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/primitives"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"
import { Textarea } from "./ui/primitives"
import { SelectOptionItem } from "./ui/select-option-item"

import { eidosFileSelectOptions } from "./eidos-file-field-properties"
import { useEidosFileAutosizedText } from "./eidos-file-text-height"
import { eidosFileUrlIsActivatable } from "./eidos-file-url-activation"
import {
  eidosFileDateTimeInputValue,
  eidosFileInstantFromInputValue,
  eidosFileResolvedTimeZone,
} from "./eidos-file-date-time"

function dateTimeInputValue(
  value: EidosFileRow[string],
  timeZone?: string
): string {
  if (typeof value !== "string" || value.length === 0) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return eidosFileDateTimeInputValue(date, timeZone)
}

type FieldEditorProps = {
  field: EidosFileFieldInfo
  row: EidosFileRow
  placeholder?: string
  appearance?: "field" | "record-title" | "record-property" | "compact"
  disabled: boolean
  onChange: (value: EidosFileSqlPrimitive) => Promise<void>
  /** The host creates the catalog option and selects it for this record. */
  onCreateOption?: (name: string) => Promise<void>
  onEnter?: () => void
  commitRef?: MutableRefObject<(() => boolean) | null>
}

/** Compact is a shared form presentation, independent of host or feature. */
export function EidosFileRecordFieldEditor(props: FieldEditorProps) {
  return props.appearance === "compact" ? (
    <div className="eidos-field-compact" data-field-type={props.field.type}>
      <FieldEditorControl {...props} />
    </div>
  ) : (
    <FieldEditorControl {...props} />
  )
}

function FieldEditorControl({
  field,
  row,
  placeholder,
  appearance = "field",
  disabled,
  onChange,
  onCreateOption,
  onEnter,
  commitRef,
}: FieldEditorProps) {
  const {
    activateUrl,
    timeZone,
    interactionMode,
    translate: t,
  } = useEidosFileUI()
  const mobileTitle =
    appearance === "record-title" && interactionMode === "mobile"
  const value = row[field.tableColumnName]
  const [draft, setDraft] = useState(
    field.type === "datetime"
      ? dateTimeInputValue(value, timeZone)
      : value === null || value === undefined
        ? ""
        : String(value)
  )
  const [datetimeError, setDatetimeError] = useState<string | null>(null)
  const [numberError, setNumberError] = useState<string | null>(null)
  const [urlError, setUrlError] = useState(false)
  const [optionQuery, setOptionQuery] = useState("")
  const [optionError, setOptionError] = useState<string | null>(null)
  const [optionBusy, setOptionBusy] = useState(false)
  const [optionOpen, setOptionOpen] = useState(false)
  const optionSaving = useRef(false)
  const optionInput = useRef<HTMLInputElement>(null)
  const discardNextBlur = useRef(false)
  const measuredText = useEidosFileAutosizedText<HTMLTextAreaElement>({
    text: draft,
    maxLines: mobileTitle
      ? 6
      : appearance === "record-title"
        ? 1
        : appearance === "compact"
          ? 6
          : field.isRecordLabel
            ? 3
            : 12,
    whiteSpace: appearance === "record-title" ? "normal" : undefined,
  })

  useEffect(() => {
    setDraft(
      field.type === "datetime"
        ? dateTimeInputValue(value, timeZone)
        : value === null || value === undefined
          ? ""
          : String(value)
    )
    setDatetimeError(null)
    setNumberError(null)
    setUrlError(false)
  }, [field.type, timeZone, value])

  const commitDraft = () => {
    let next: EidosFileSqlPrimitive = draft.trim().length > 0 ? draft : null
    if (field.type === "number") {
      const number = Number(draft)
      if (draft.trim().length > 0 && !Number.isFinite(number)) {
        setNumberError(t("Enter a finite number."))
        return false
      }
      next = draft.trim().length > 0 ? number : null
    } else if (field.type === "rating") {
      const number = Number(draft)
      const maximum =
        typeof field.settings?.max === "number" ? field.settings.max : 5
      if (
        draft.trim().length > 0 &&
        (!Number.isInteger(number) || number < 0 || number > maximum)
      ) {
        setNumberError(
          t("Enter a whole number from 0 to {maximum}.", { maximum })
        )
        return false
      }
      next = draft.trim().length > 0 ? number : null
    } else if (field.type === "integer" && draft.trim().length > 0) {
      next = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(draft.trim())
        ? BigInt(draft.trim())
        : draft
    } else if (field.type === "datetime" && draft) {
      const date = eidosFileInstantFromInputValue(draft, timeZone)
      if (!date) {
        setDatetimeError(
          t(
            "This time is ambiguous or unavailable in {timeZone}. Choose another time.",
            { timeZone: eidosFileResolvedTimeZone(timeZone) }
          )
        )
        return false
      }
      next = date.toISOString()
    }
    setDatetimeError(null)
    setNumberError(null)
    if (!Object.is(value, next)) void onChange(next)
    return true
  }
  const commitOnBlur = () => {
    if (discardNextBlur.current) {
      discardNextBlur.current = false
      return
    }
    commitDraft()
  }
  useLayoutEffect(() => {
    if (!commitRef) return
    commitRef.current = [
      "text",
      "url",
      "number",
      "integer",
      "rating",
      "date",
      "datetime",
    ].includes(field.type)
      ? commitDraft
      : null
    return () => {
      commitRef.current = null
    }
  })

  if (field.type === "checkbox") {
    const checkboxValue =
      value === null || value === undefined
        ? "empty"
        : value === true || value === 1 || value === "1"
          ? "checked"
          : "unchecked"
    if (appearance === "record-property" || appearance === "compact")
      return (
        <div className="flex min-h-11 items-center gap-2">
          <button
            type="button"
            role="checkbox"
            aria-label={field.name}
            aria-checked={
              checkboxValue === "empty" ? "mixed" : checkboxValue === "checked"
            }
            disabled={disabled}
            className="eidos-field-checkbox flex h-11 min-w-11 items-center justify-start"
            onClick={() => void onChange(checkboxValue === "checked" ? 0 : 1)}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded border border-input">
              {checkboxValue === "checked" ? (
                <Check size={16} />
              ) : checkboxValue === "empty" ? (
                "−"
              ) : null}
            </span>
          </button>
          {appearance !== "compact" &&
            field.nullable !== false &&
            checkboxValue !== "empty" && (
              <button
                type="button"
                disabled={disabled}
                className="eidos-field-clear flex h-11 w-11 items-center justify-center text-muted-foreground"
                aria-label={t("Clear")}
                onClick={() => void onChange(null)}
              >
                <X size={16} />
              </button>
            )}
        </div>
      )
    return (
      <Select
        value={checkboxValue}
        disabled={disabled}
        onValueChange={(next) =>
          void onChange(next === "empty" ? null : next === "checked" ? 1 : 0)
        }
      >
        <SelectTrigger className="h-8 text-xs" aria-label={field.name}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.nullable !== false ? (
            <SelectItem value="empty">{t("Empty")}</SelectItem>
          ) : null}
          <SelectItem value="checked">{t("Checked")}</SelectItem>
          <SelectItem value="unchecked">{t("Unchecked")}</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  if (field.type === "select" && !onCreateOption) {
    const options = eidosFileSelectOptions(field)
    const rawValue = typeof value === "string" && value ? value : null
    const hasUnconfiguredValue =
      rawValue !== null && !options.some((option) => option.value === rawValue)
    return (
      <Select
        value={typeof value === "string" && value ? value : "__empty__"}
        disabled={disabled}
        onValueChange={(next) =>
          void onChange(next === "__empty__" ? null : next)
        }
      >
        <SelectTrigger className="h-8 text-xs" aria-label={field.name}>
          <SelectValue placeholder={placeholder ?? t("Empty")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty__">{t("Empty")}</SelectItem>
          {hasUnconfiguredValue ? (
            <SelectItem value={rawValue}>
              <SelectOptionItem option={{ name: rawValue, color: "default" }} />
            </SelectItem>
          ) : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <SelectOptionItem option={option} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (field.type === "multi-select" || field.type === "select") {
    const single = field.type === "select"
    const selected = single
      ? typeof value === "string" && value
        ? [value]
        : []
      : decodeEidosFileMultiSelectValues(
          typeof value === "string" ? value : null
        )
    const selectedSet = new Set(selected)
    const options = eidosFileSelectOptions(field)
    const query = optionQuery.trim()
    const filtered = options.filter((option) =>
      option.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    )
    const existing = options.find((option) => option.name === query)
    const createOption = async () => {
      if (!onCreateOption || !query || disabled || optionSaving.current) return
      optionSaving.current = true
      setOptionBusy(true)
      setOptionError(null)
      try {
        await onCreateOption(query)
        setOptionQuery("")
        if (single) setOptionOpen(false)
        else optionInput.current?.focus()
      } catch (cause) {
        setOptionError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        optionSaving.current = false
        setOptionBusy(false)
      }
    }
    return (
      <Popover
        open={optionOpen}
        onOpenChange={(open) => {
          setOptionOpen(open)
          setOptionQuery("")
          setOptionError(null)
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="eidos-field-multi h-auto min-h-8 w-full justify-start whitespace-normal px-2 py-1 text-left text-xs font-normal"
            aria-label={field.name}
            aria-haspopup="dialog"
            disabled={disabled}
          >
            {selected.length > 0 ? (
              <span className="flex min-w-0 flex-wrap gap-1">
                {selected.map((selectedValue) => {
                  const option = options.find(
                    (candidate) => candidate.value === selectedValue
                  ) ?? { name: selectedValue, color: "default" }
                  return (
                    <SelectOptionItem
                      key={selectedValue}
                      option={option}
                      className="max-w-[180px]"
                    />
                  )
                })}
              </span>
            ) : (
              (placeholder ?? t("Empty"))
            )}
            {single && (
              <ChevronDown
                className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50"
                aria-hidden="true"
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="eidos-multi-options w-64 p-1">
          {onCreateOption && (
            <div
              className={
                appearance === "compact" ? "eidos-field-compact mb-1" : "mb-1"
              }
            >
              <Input
                ref={optionInput}
                value={optionQuery}
                aria-label={t("Search or create an option…")}
                placeholder={t("Search or create an option…")}
                className="h-7 text-xs"
                disabled={disabled}
                readOnly={optionBusy}
                aria-busy={optionBusy}
                onChange={(event) => {
                  setOptionQuery(event.target.value)
                  setOptionError(null)
                }}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    event.nativeEvent.isComposing ||
                    event.keyCode === 229
                  )
                    return
                  event.preventDefault()
                  if (disabled || optionSaving.current) return
                  if (existing) {
                    if (!selectedSet.has(existing.value))
                      void onChange(
                        single
                          ? existing.value
                          : encodeEidosFileMultiSelectValues([
                              ...selected,
                              existing.value,
                            ])
                      )
                    setOptionQuery("")
                    if (single) setOptionOpen(false)
                  } else void createOption()
                }}
              />
            </div>
          )}
          <div
            className="grid gap-0.5"
            role={single ? "radiogroup" : undefined}
            aria-label={single ? field.name : undefined}
          >
            {single && !query && (
              <button
                type="button"
                role="radio"
                aria-checked={selected.length === 0}
                className="flex min-h-7 items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={disabled || optionBusy}
                onClick={() => {
                  void onChange(null)
                  setOptionOpen(false)
                }}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center"
                  aria-hidden="true"
                >
                  {selected.length === 0 ? <Check className="h-3 w-3" /> : null}
                </span>
                {t("Empty")}
              </button>
            )}
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  appearance === "compact"
                    ? "flex min-h-7 items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    : "flex h-8 items-center gap-2 rounded px-2 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                }
                role={single ? "radio" : "checkbox"}
                aria-checked={selectedSet.has(option.value)}
                disabled={disabled || optionBusy}
                onClick={() => {
                  if (single) {
                    void onChange(option.value)
                    setOptionOpen(false)
                    return
                  }
                  const next = selectedSet.has(option.value)
                    ? selected.filter((value) => value !== option.value)
                    : [...selected, option.value]
                  void onChange(encodeEidosFileMultiSelectValues(next))
                }}
              >
                <span
                  className={
                    single
                      ? "flex h-4 w-4 items-center justify-center"
                      : "flex h-4 w-4 items-center justify-center rounded border"
                  }
                >
                  {selectedSet.has(option.value) ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                </span>
                <SelectOptionItem option={option} className="max-w-[190px]" />
              </button>
            ))}
          </div>
          {!filtered.length && !query && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t("No options")}
            </p>
          )}
          {onCreateOption && query && !existing && (
            <button
              type="button"
              disabled={disabled || optionBusy}
              className="eidos-multi-option-create"
              onClick={() => void createOption()}
            >
              <Plus size={13} aria-hidden="true" />
              <span>
                {t(optionBusy ? "Creating…" : "Create option: {name}", {
                  name: query,
                })}
              </span>
            </button>
          )}
          {optionError && (
            <p role="alert" className="px-2 py-1 text-xs text-destructive">
              {optionError}
            </p>
          )}
        </PopoverContent>
      </Popover>
    )
  }

  if (field.type === "text") {
    return (
      <Textarea
        ref={measuredText.ref}
        value={draft}
        rows={1}
        wrap="soft"
        aria-label={field.name}
        placeholder={placeholder}
        disabled={disabled}
        className={
          appearance === "record-property"
            ? "eidos-mobile-inline-text min-h-11 w-full resize-none overflow-x-hidden whitespace-pre-wrap [overflow-wrap:anywhere] rounded-none border-0 px-0 py-2 text-base leading-relaxed shadow-none focus-visible:ring-0"
            : appearance === "record-title"
              ? `min-h-8 w-full resize-none rounded-none border-0 px-0 py-0 text-xl font-semibold leading-tight tracking-tight shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0 sm:text-2xl ${mobileTitle ? "overflow-x-hidden [overflow-wrap:anywhere]" : ""}`
              : "min-h-8 resize-none text-xs leading-5"
        }
        style={
          appearance === "record-property"
            ? { ...measuredText.style, minHeight: 44 }
            : appearance === "record-title" && !mobileTitle
              ? {
                  ...measuredText.style,
                  height: "1lh",
                  minHeight: "1lh",
                  maxHeight: "1lh",
                  overflowY: "hidden",
                }
              : measuredText.style
        }
        title={appearance === "record-title" ? draft : undefined}
        data-eidos-file-text-overflow={
          measuredText.overflowing
            ? appearance === "record-title" && !mobileTitle
              ? "clipped"
              : "scroll"
            : undefined
        }
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitOnBlur}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (event.key === "Escape" && appearance === "compact") {
            discardNextBlur.current = true
            setDraft(value == null ? "" : String(value))
            event.currentTarget.blur()
            return
          }
          if (
            event.key === "Enter" &&
            (appearance === "record-title" ||
              appearance === "record-property") &&
            !event.shiftKey &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
          ) {
            event.preventDefault()
            event.currentTarget.blur()
            onEnter?.()
            return
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.currentTarget.blur()
          }
        }}
      />
    )
  }

  if (
    field.type === "rating" &&
    (appearance === "record-property" || appearance === "compact")
  ) {
    const maximum =
      typeof field.settings?.max === "number" ? field.settings.max : 5
    return (
      <div className="min-w-0">
        <div
          role="group"
          aria-label={field.name}
          className="flex min-h-11 flex-wrap items-center"
        >
          {Array.from({ length: maximum }, (_, index) => index + 1).map(
            (rating) => (
              <button
                type="button"
                key={rating}
                className="flex h-11 min-w-8 flex-1 items-center justify-center"
                disabled={disabled}
                aria-label={t("Rate {value}", { value: rating })}
                aria-pressed={Number(value) === rating && value != null}
                onClick={() =>
                  void onChange(
                    value != null && Number(value) === rating
                      ? field.nullable === false
                        ? 0
                        : null
                      : rating
                  )
                }
              >
                <Star
                  size={22}
                  fill={Number(value) >= rating ? "currentColor" : "none"}
                />
              </button>
            )
          )}
          {appearance !== "compact" && (
            <button
              type="button"
              disabled={disabled}
              className="h-11 min-w-8 text-sm text-muted-foreground"
              aria-label={t("Rate {value}", { value: 0 })}
              aria-pressed={value === 0}
              onClick={() => void onChange(0)}
            >
              0
            </button>
          )}
          {appearance !== "compact" &&
            field.nullable !== false &&
            value != null && (
              <button
                type="button"
                disabled={disabled}
                className="eidos-field-clear flex h-11 min-w-8 items-center justify-center text-muted-foreground"
                aria-label={t("Clear")}
                onClick={() => void onChange(null)}
              >
                <X size={16} />
              </button>
            )}
        </div>
      </div>
    )
  }

  const supportedInput = new Set([
    "url",
    "number",
    "integer",
    "rating",
    "date",
    "datetime",
  ])
  if (supportedInput.has(field.type)) {
    const input = (
      <Input
        type={
          field.type === "number" || field.type === "rating"
            ? "text"
            : field.type === "integer"
              ? "text"
              : field.type === "date"
                ? "date"
                : field.type === "datetime"
                  ? "datetime-local"
                  : "url"
        }
        value={draft}
        aria-label={field.name}
        placeholder={placeholder}
        aria-invalid={
          (field.type === "datetime" && Boolean(datetimeError)) ||
          ((field.type === "number" || field.type === "rating") &&
            Boolean(numberError))
        }
        disabled={disabled}
        inputMode={
          field.type === "integer" || field.type === "rating"
            ? "numeric"
            : field.type === "number"
              ? "decimal"
              : undefined
        }
        className={[
          appearance === "record-property"
            ? "h-11 min-w-0 w-full rounded-none border-0 px-0 text-base shadow-none focus-visible:ring-0"
            : "h-8 text-xs",
          field.type === "url" ? "pr-9" : "",
        ].join(" ")}
        onChange={(event) => {
          setDraft(event.target.value)
          if (field.type === "url") setUrlError(false)
          if (field.type === "datetime") setDatetimeError(null)
          if (field.type === "number" || field.type === "rating") {
            setNumberError(null)
          }
        }}
        onBlur={commitOnBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            discardNextBlur.current = true
            setDraft(
              field.type === "datetime"
                ? dateTimeInputValue(value, timeZone)
                : value === null || value === undefined
                  ? ""
                  : String(value)
            )
            setDatetimeError(null)
            setNumberError(null)
            event.currentTarget.blur()
          }
        }}
      />
    )
    if (field.type === "url") {
      return (
        <div className="min-w-0">
          <div className="relative">
            {input}
            {activateUrl && eidosFileUrlIsActivatable(draft) ? (
              <button
                type="button"
                className="eidos-field-url-action absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                aria-label={t("Open URL")}
                title={t("Open URL")}
                disabled={disabled}
                onClick={async () => {
                  setUrlError(false)
                  try {
                    await activateUrl(draft)
                  } catch {
                    setUrlError(true)
                  }
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {urlError ? (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {t("Could not open URL. Try again.")}
            </p>
          ) : null}
        </div>
      )
    }
    if (field.type === "datetime") {
      return (
        <div className="min-w-0">
          {input}
          <p
            className={
              datetimeError
                ? "mt-1 text-[10px] leading-4 text-destructive"
                : "mt-1 text-[10px] text-muted-foreground"
            }
          >
            {datetimeError ??
              t("Time zone: {timeZone}", {
                timeZone: eidosFileResolvedTimeZone(timeZone),
              })}
          </p>
        </div>
      )
    }
    if (field.type === "number" || field.type === "rating") {
      return (
        <div className="min-w-0">
          {input}
          {numberError ? (
            <p className="mt-1 text-[10px] leading-4 text-destructive">
              {numberError}
            </p>
          ) : null}
        </div>
      )
    }
    return input
  }

  return null
}
