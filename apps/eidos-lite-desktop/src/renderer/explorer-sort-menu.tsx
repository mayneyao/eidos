import { useEffect, useRef, useState } from "react"
import { ArrowDownUp, Check } from "lucide-react"
import type { ExplorerSort } from "./explorer-sort"
import { useEidosLiteI18n } from "./i18n"

export function ExplorerSortMenu({
  sort,
  onChange,
}: {
  sort: ExplorerSort
  onChange(sort: ExplorerSort): void
}) {
  const { t } = useEidosLiteI18n()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false)
    }
    document.addEventListener("pointerdown", outside, true)
    return () => document.removeEventListener("pointerdown", outside, true)
  }, [open])
  function choose(next: ExplorerSort) {
    onChange(next)
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }
  return (
    <div
      ref={container}
      className="workspace-heading-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus({ preventScroll: true })
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        aria-label={t("Sort files")}
        title={t("Sort files")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ArrowDownUp size={14} />
      </button>
      {open && (
        <div
          className="workspace-heading-menu-content"
          role="group"
          aria-label={t("Sort files")}
        >
          {(
            [
              ["name", "Name"],
              ["modified", "Modified time"],
              ["type", "File type"],
            ] as const
          ).map(([by, label]) => (
            <button
              key={by}
              type="button"
              aria-pressed={sort.by === by}
              onClick={() => choose({ ...sort, by })}
            >
              <Check
                aria-hidden="true"
                style={{ visibility: sort.by === by ? "visible" : "hidden" }}
              />
              {t(label)}
            </button>
          ))}
          <hr className="explorer-sort-divider" />
          {(
            [
              ["ascending", "Ascending"],
              ["descending", "Descending"],
            ] as const
          ).map(([direction, label]) => (
            <button
              key={direction}
              type="button"
              aria-pressed={sort.direction === direction}
              onClick={() => choose({ ...sort, direction })}
            >
              <Check
                aria-hidden="true"
                style={{
                  visibility:
                    sort.direction === direction ? "visible" : "hidden",
                }}
              />
              {t(label)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
