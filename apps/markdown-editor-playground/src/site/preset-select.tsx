import type { BuiltInMarkdownProfileId } from "@eidos.space/markdown"
import { useSiteLocale } from "./locale"
import { presets } from "./presets"

export function PresetSelect({
  value,
  onChange,
}: {
  value: BuiltInMarkdownProfileId
  onChange(value: BuiltInMarkdownProfileId): void
}) {
  const { t } = useSiteLocale()
  return (
    <label className="site-preset-select">
      <span>{t("Preset", "预设")}</span>
      <select
        aria-label={t("Preset", "预设")}
        value={value}
        onChange={(event) => {
          const preset = presets.find(
            (entry) => entry.id === event.target.value
          )
          if (preset) onChange(preset.id)
        }}
      >
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
    </label>
  )
}
