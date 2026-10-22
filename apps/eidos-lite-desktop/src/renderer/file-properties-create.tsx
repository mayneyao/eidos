import { useId, useState, type FormEvent } from "react"
import type { CreateEidosFileSourceFieldInput } from "@eidos.space/eidos-file"
import {
  EidosFileFieldTypeIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useEidosFileUI,
} from "@eidos.space/eidos-file-ui"
import { useEidosLiteI18n } from "./i18n"

const TYPES = [
  ["text", "Text"],
  ["number", "Number"],
  ["integer", "Integer"],
  ["checkbox", "Checkbox"],
  ["select", "Select"],
  ["multi-select", "Multi-select"],
  ["rating", "Rating"],
  ["date", "Date"],
  ["datetime", "Date & time"],
  ["url", "URL"],
] as const
type PropertyType = (typeof TYPES)[number][0]

/** Lite's small native-style form. Runtime owns validation and column identity. */
export function FilePropertiesCreate({
  disabled,
  onCreate,
  onCancel,
}: {
  disabled: boolean
  onCreate(input: CreateEidosFileSourceFieldInput): Promise<void>
  onCancel(): void
}) {
  const { t } = useEidosLiteI18n()
  const { translate } = useEidosFileUI()
  const id = useId()
  const [name, setName] = useState("")
  const [type, setType] = useState<PropertyType>("text")
  const [options, setOptions] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choices = type === "select" || type === "multi-select"
  const busy = saving || disabled
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const colors = ["blue", "green", "orange", "purple", "pink", "gray"]
      await onCreate({
        name: name.trim(),
        type,
        ...(choices
          ? {
              property: {
                options: [
                  ...new Set(
                    options
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean)
                  ),
                ].map((name, index) => ({
                  name,
                  color: colors[index % colors.length]!,
                })),
              },
            }
          : {}),
        ...(type === "multi-select"
          ? { storageCodec: "json_array" as const }
          : {}),
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      className="file-properties-create"
      onSubmit={(event) => void submit(event)}
    >
      <h2>{t("New property")}</h2>
      <div className="file-properties-create-row">
        <label htmlFor={`${id}-name`}>{translate("Name")}:</label>
        <input
          id={`${id}-name`}
          autoFocus
          autoComplete="off"
          value={name}
          disabled={busy}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
      </div>
      <div className="file-properties-create-row">
        <label htmlFor={`${id}-type`}>{translate("Type")}:</label>
        <Select
          value={type}
          disabled={busy}
          onValueChange={(value) => setType(value as PropertyType)}
        >
          <SelectTrigger id={`${id}-type`} aria-label={translate("Type")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="file-properties-type-menu">
            {TYPES.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                <span className="file-properties-type">
                  <EidosFileFieldTypeIcon type={value} />
                  {translate(label)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {choices && (
        <div className="file-properties-create-row">
          <label htmlFor={`${id}-options`}>{translate("Options")}:</label>
          <textarea
            id={`${id}-options`}
            rows={3}
            placeholder={t("One option per line")}
            value={options}
            disabled={busy}
            onChange={(event) => setOptions(event.target.value)}
          />
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" disabled={saving} onClick={onCancel}>
          {translate("Cancel")}
        </button>
        <button type="submit" disabled={busy || !name.trim()}>
          {translate("Create field")}
        </button>
      </footer>
    </form>
  )
}
