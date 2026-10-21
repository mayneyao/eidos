import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"

/** Finder Get Info uses the same disclosure geometry for every section. */
export function FilePropertiesSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <details open className="file-properties-section">
      <summary
        onClick={(event) => {
          if (!event.altKey) return
          event.preventDefault()
          const section = event.currentTarget
            .parentElement as HTMLDetailsElement
          const open = !section.open
          section
            .closest(".file-properties-content")
            ?.querySelectorAll<HTMLDetailsElement>(
              "details.file-properties-section"
            )
            .forEach((item) => {
              item.open = open
            })
        }}
      >
        <ChevronRight aria-hidden="true" size={12} />
        <span>{title}:</span>
      </summary>
      <div className="file-properties-section-body">{children}</div>
    </details>
  )
}
