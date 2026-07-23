import {
  BookOpen,
  BriefcaseBusiness,
  CalendarRange,
  ChevronRight,
  ContactRound,
  HeartPulse,
  LayoutTemplate,
  LoaderCircle,
  Microscope,
  TableProperties,
  WalletCards,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import type { Locale } from "../i18n"
import {
  EIDOS_FILE_TEMPLATES,
  type EidosFileTemplateId,
} from "../sample-eidos-file"

const templateIcons: Record<EidosFileTemplateId, LucideIcon> = {
  "project-portfolio": BriefcaseBusiness,
  "personal-crm": ContactRound,
  "household-finance": WalletCards,
  "reading-library": BookOpen,
  "habit-journal": HeartPulse,
  "content-calendar": CalendarRange,
  "feature-lab": Microscope,
  "field-capabilities": TableProperties,
}

interface EidosFileTemplatePickerProps {
  locale: Locale
  disabled: boolean
  openingTemplateId: EidosFileTemplateId | null
  onSelect: (id: EidosFileTemplateId) => void
}

export function EidosFileTemplatePicker({
  locale,
  disabled,
  openingTemplateId,
  onSelect,
}: EidosFileTemplatePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const firstTemplateRef = useRef<HTMLButtonElement>(null)
  const labels =
    locale === "zh"
      ? {
          trigger: "选择体验模板",
          heading: "从模板开始",
          intro: "选择一个完整的本地 .eidos 文件，立即体验高级数据模型。",
          count: `${EIDOS_FILE_TEMPLATES.length} 个场景`,
          open: "打开",
        }
      : {
          trigger: "Choose a template",
          heading: "Start from a template",
          intro:
            "Open a complete local .eidos file and explore its advanced data model.",
          count: `${EIDOS_FILE_TEMPLATES.length} scenarios`,
          open: "Open",
        }

  useEffect(() => {
    if (!open) return
    firstTemplateRef.current?.focus()

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      rootRef.current
        ?.querySelector<HTMLButtonElement>(".template-picker-trigger")
        ?.focus()
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div className="template-picker" ref={rootRef}>
      <button
        className="secondary-button template-picker-trigger"
        type="button"
        aria-expanded={open}
        aria-controls="eidos-file-template-list"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <LayoutTemplate size={16} aria-hidden="true" />
        {labels.trigger}
        <span className="template-picker-count">{labels.count}</span>
      </button>

      {open ? (
        <section
          id="eidos-file-template-list"
          className="template-picker-panel"
          aria-labelledby="eidos-file-template-heading"
        >
          <header className="template-picker-header">
            <div>
              <h2 id="eidos-file-template-heading">{labels.heading}</h2>
              <p>{labels.intro}</p>
            </div>
            <span>{labels.count}</span>
          </header>
          <ul className="template-picker-list">
            {EIDOS_FILE_TEMPLATES.map((template, index) => {
              const copy = template.copy[locale]
              const Icon = templateIcons[template.id]
              const isOpening = openingTemplateId === template.id
              return (
                <li key={template.id}>
                  <button
                    ref={index === 0 ? firstTemplateRef : undefined}
                    type="button"
                    disabled={disabled}
                    aria-label={`${labels.open} ${copy.title}${
                      locale === "zh" ? "模板" : " template"
                    }`}
                    onClick={() => onSelect(template.id)}
                  >
                    <span className="template-picker-icon" aria-hidden="true">
                      {isOpening ? (
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <Icon size={17} />
                      )}
                    </span>
                    <span className="template-picker-copy">
                      <span className="template-picker-title-row">
                        <strong>{copy.title}</strong>
                        <small>{copy.category}</small>
                      </span>
                      <span className="template-picker-description">
                        {copy.description}
                      </span>
                      <span className="template-picker-highlights">
                        {copy.highlights.join(" · ")}
                      </span>
                    </span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
