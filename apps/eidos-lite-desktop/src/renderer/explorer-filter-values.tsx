import { useRef, useState } from "react"
import { X } from "lucide-react"
import type { EidosFileFilterRuleValue } from "@eidos.space/eidos-file"
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@eidos.space/eidos-file-ui/ui/primitives"
import { parseExplorerFileFilter } from "./explorer-file-filter"
import { useEidosLiteI18n } from "./i18n"

export function ExplorerSuffixValues({
  value,
  onChange,
}: {
  value: readonly string[]
  onChange(value: string[]): void
}) {
  const { t } = useEidosLiteI18n()
  const [query, setQuery] = useState("")
  const [invalid, setInvalid] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const commit = (text: string) => {
    if (!text.trim()) return
    try {
      const next = parseExplorerFileFilter([...value, text].join(","))
      onChange(next)
      setQuery("")
      setInvalid(false)
    } catch {
      setInvalid(true)
    }
  }
  return (
    <div className="explorer-suffix-editor">
      <div
        className="explorer-suffix-values"
        onClick={() => input.current?.focus()}
      >
        {value.map((suffix) => (
          <span className="explorer-suffix-chip" key={suffix}>
            {suffix}
            <button
              type="button"
              aria-label={t("Remove suffix {suffix}", { suffix })}
              onClick={() => onChange(value.filter((item) => item !== suffix))}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <Input
          className="h-7 min-w-0 border-0 bg-transparent px-1 text-xs shadow-none"
          ref={input}
          aria-label={t("Suffix values")}
          value={query}
          placeholder=".md, .eidos"
          maxLength={4096}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={(event) => {
            composing.current = false
            const text = event.currentTarget.value
            if (/[,，;；\s]/u.test(text)) commit(text)
          }}
          onChange={(event) => {
            const text = event.currentTarget.value
            setQuery(text)
            setInvalid(false)
            if (!composing.current && /[,，;；\s]/u.test(text)) commit(text)
          }}
          onBlur={() => {
            if (!composing.current) commit(query)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || composing.current) return
            if (event.key === "Enter") {
              event.preventDefault()
              event.stopPropagation()
              commit(query)
            }
            if (event.key === "Backspace" && !query && value.length)
              onChange(value.slice(0, -1))
          }}
        />
      </div>
      {(invalid || query) && (
        <p role={invalid ? "alert" : undefined}>
          {t(
            invalid
              ? "Enter suffixes such as .md or .tar.gz."
              : "Press Enter or comma to add a suffix."
          )}
        </p>
      )}
    </div>
  )
}

const sizeUnits = { B: 1, KB: 1_000, MB: 1_000_000, GB: 1_000_000_000 }
type SizeUnit = keyof typeof sizeUnits
const units = Object.keys(sizeUnits) as SizeUnit[]

function sizeThreshold(amount: string, unit: SizeUnit): number | "" {
  if (!amount.trim()) return ""
  const bytes = Number(amount.replace(",", ".")) * sizeUnits[unit]
  return Number.isFinite(bytes) &&
    bytes >= 0 &&
    bytes <= Number.MAX_SAFE_INTEGER
    ? bytes
    : ""
}

export function ExplorerSizeValues({
  value,
  range,
  onChange,
}: {
  value: EidosFileFilterRuleValue | undefined
  range: boolean
  onChange(value: EidosFileFilterRuleValue): void
}) {
  const { t } = useEidosLiteI18n()
  const [draft, setDraft] = useState<{
    key: string
    unit: SizeUnit
    amounts: string[]
  }>()
  const key = JSON.stringify(value)
  const values = (Array.isArray(value) ? value : [value]).map((entry) =>
    typeof entry === "number" || typeof entry === "string"
      ? sizeThreshold(String(entry), "B")
      : ""
  )
  const largest = Math.max(0, ...values.map(Number))
  const unit =
    draft?.unit ??
    units.reduce<SizeUnit>(
      (unit, next) => (largest >= sizeUnits[next] ? next : unit),
      "B"
    )
  const amounts =
    draft?.key === key
      ? draft.amounts
      : Array.from({ length: range ? 2 : 1 }, (_, index) => {
          const bytes = values[index]
          return typeof bytes === "number"
            ? String(bytes / sizeUnits[unit])
            : ""
        })
  const thresholds = amounts.map((amount) => sizeThreshold(amount, unit))
  const reversed =
    range &&
    typeof thresholds[0] === "number" &&
    typeof thresholds[1] === "number" &&
    thresholds[0] > thresholds[1]

  const update = (nextAmounts: string[], nextUnit: SizeUnit) => {
    const next = nextAmounts.map((amount) => sizeThreshold(amount, nextUnit))
    const operand = range ? next : (next[0] ?? "")
    setDraft({
      key: JSON.stringify(operand),
      unit: nextUnit,
      amounts: nextAmounts,
    })
    onChange(operand)
  }

  return (
    <div className="flex min-w-0 gap-1.5">
      {amounts.map((amount, index) => {
        const label = t(
          range
            ? index === 0
              ? "Minimum file size"
              : "Maximum file size"
            : "File size"
        )
        return (
          <Input
            key={label}
            aria-label={label}
            title={
              reversed
                ? t("Minimum file size must be at most maximum file size.")
                : label
            }
            aria-invalid={
              reversed ||
              (thresholds[index] === "" && !!amount.trim()) ||
              undefined
            }
            className="h-7 min-w-0 flex-1 px-2 text-xs"
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              const next = [...amounts]
              next[index] = event.target.value
              update(next, unit)
            }}
          />
        )
      })}
      <Select
        value={unit}
        onValueChange={(value: SizeUnit) => update(amounts, value)}
      >
        <SelectTrigger
          aria-label={t("File size unit")}
          className="h-7 w-auto shrink-0 gap-1 px-2 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem key={unit} value={unit}>
              {unit}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
