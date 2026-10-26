import { useRef, useState } from "react"
import { X } from "lucide-react"
import { Input } from "@eidos.space/eidos-file-ui/ui/primitives"
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
