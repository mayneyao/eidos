import { ChevronDown, Languages } from "lucide-react"

import { EIDOS_FILE_LOCALES, useI18n, type Locale } from "../i18n"

interface EidosFileLanguageSelectProps {
  onChange?: (locale: Locale) => void
}

export function EidosFileLanguageSelect({
  onChange,
}: EidosFileLanguageSelectProps) {
  const { locale, setLocale, t } = useI18n()
  const current =
    EIDOS_FILE_LOCALES.find((option) => option.value === locale) ??
    EIDOS_FILE_LOCALES[0]

  return (
    <div
      className="language-select"
      data-eidos-file-language-select
      title={t("languageSelector")}
    >
      <Languages size={14} aria-hidden="true" />
      <span aria-hidden="true">{current.shortLabel}</span>
      <ChevronDown
        className="language-select-chevron"
        size={12}
        aria-hidden="true"
      />
      <select
        aria-label={t("languageSelector")}
        value={locale}
        onChange={(event) => {
          const nextLocale = event.currentTarget.value as Locale
          if (onChange) onChange(nextLocale)
          else setLocale(nextLocale)
        }}
      >
        {EIDOS_FILE_LOCALES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
