import { useState, type KeyboardEvent } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEidosLiteI18n } from "./i18n"

interface Screenshot {
  src: string
  alt: string
}

export function PluginScreenshotCarousel({
  screenshots,
  onPreview,
}: {
  screenshots: Screenshot[]
  onPreview(screenshot: Screenshot): void
}) {
  const { t } = useEidosLiteI18n()
  const [selected, setSelected] = useState(0)
  const current = Math.min(selected, screenshots.length - 1)
  const screenshot = screenshots[current]
  if (!screenshot) return null

  const select = (index: number) =>
    setSelected((index + screenshots.length) % screenshots.length)
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      screenshots.length < 2
    )
      return
    let next: number
    switch (event.key) {
      case "ArrowLeft":
        next = current - 1
        break
      case "ArrowRight":
        next = current + 1
        break
      case "Home":
        next = 0
        break
      case "End":
        next = screenshots.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    select(next)
    if (
      event.target instanceof HTMLElement &&
      event.target.hasAttribute("data-screenshot-index")
    ) {
      const index = (next + screenshots.length) % screenshots.length
      event.currentTarget
        .querySelector<HTMLButtonElement>(`[data-screenshot-index="${index}"]`)
        ?.focus()
    }
  }

  return (
    <section
      className="plugin-screenshots-section"
      aria-label={t("Screenshots")}
      aria-roledescription={t("Carousel")}
      onKeyDown={handleKeyDown}
    >
      <figure
        className="plugin-screenshot-figure"
        role="group"
        aria-label={`${current + 1} / ${screenshots.length}`}
      >
        <button
          type="button"
          className="plugin-screenshot-btn"
          onClick={() => onPreview(screenshot)}
          aria-label={t("View full image: {alt}", { alt: screenshot.alt })}
        >
          <img
            src={screenshot.src}
            alt={screenshot.alt}
            className="plugin-screenshot-img"
          />
        </button>
        <figcaption className="plugin-screenshot-caption">
          {screenshot.alt}
        </figcaption>
      </figure>
      {screenshots.length > 1 && (
        <div className="plugin-screenshot-controls">
          <button
            type="button"
            onClick={() => select(current - 1)}
            aria-label={t("Previous screenshot")}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <div
            className="plugin-screenshot-dots"
            role="group"
            aria-label={t("Choose screenshot")}
          >
            {screenshots.map((item, index) => (
              <button
                key={item.src}
                type="button"
                data-screenshot-index={index}
                aria-pressed={current === index}
                aria-label={t("Screenshot {number}: {alt}", {
                  number: index + 1,
                  alt: item.alt,
                })}
                onClick={() => select(index)}
              >
                <span />
              </button>
            ))}
          </div>
          <span
            className="plugin-screenshot-position"
            aria-live="polite"
            aria-atomic="true"
          >
            {current + 1} / {screenshots.length}
          </span>
          <button
            type="button"
            onClick={() => select(current + 1)}
            aria-label={t("Next screenshot")}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  )
}
