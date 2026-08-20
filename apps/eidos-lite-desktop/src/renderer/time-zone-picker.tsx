import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Search } from "lucide-react"

import type { EidosLiteMessageValues } from "../shared/i18n"
import {
  filterTimeZoneOptions,
  supportedTimeZones,
  systemTimeZone,
  timeZoneOption,
  type TimeZoneOption,
} from "./time-zone-data"

interface TimeZonePickerProps {
  readonly value: string
  readonly label: string
  readonly onChange: (value: string) => void
  readonly t: (message: string, values?: EidosLiteMessageValues) => string
}

interface PopoverPosition {
  readonly left: number
  readonly top?: number
  readonly bottom?: number
  readonly width: number
  readonly maxHeight: number
}

interface TimeZoneRow {
  readonly key: string
  readonly value: string
  readonly option: TimeZoneOption
  readonly current?: boolean
  readonly selectStart?: boolean
}

function positionForTrigger(trigger: HTMLElement): PopoverPosition {
  const rect = trigger.getBoundingClientRect()
  const edge = 8
  const gap = 4
  const preferredWidth = Math.max(rect.width, 320)
  const width = Math.min(preferredWidth, window.innerWidth - edge * 2)
  const left = Math.min(
    Math.max(edge, rect.right - width),
    window.innerWidth - width - edge
  )
  const spaceBelow = window.innerHeight - rect.bottom - gap - edge
  const spaceAbove = rect.top - gap - edge
  const openAbove = spaceBelow < 280 && spaceAbove > spaceBelow
  const maxHeight = Math.max(
    220,
    Math.min(480, openAbove ? spaceAbove : spaceBelow)
  )
  return {
    left,
    ...(openAbove
      ? { bottom: window.innerHeight - rect.top + gap }
      : { top: rect.bottom + gap }),
    width,
    maxHeight,
  }
}

function TimeZoneOptionRow({
  active,
  checked,
  id,
  option,
  onHover,
  onSelect,
}: {
  readonly active: boolean
  readonly checked: boolean
  readonly id: string
  readonly option: TimeZoneOption
  readonly onHover: () => void
  readonly onSelect: () => void
}) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={checked}
      className="time-zone-option"
      data-active={active || undefined}
      onPointerMove={onHover}
      onClick={onSelect}
    >
      <span className="time-zone-option-copy">
        <strong>{option.city}</strong>
        <small>{option.offset}</small>
      </span>
      {checked ? <Check aria-hidden="true" /> : null}
    </button>
  )
}

export function TimeZonePicker({
  value,
  label,
  onChange,
  t,
}: TimeZonePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<PopoverPosition | null>(null)
  const resolvedSystemTimeZone = systemTimeZone()

  const options = useMemo(() => {
    const zones = supportedTimeZones()
    const current = value === "system" ? resolvedSystemTimeZone : value
    if (!zones.includes(current)) zones.push(current)
    return zones
      .map((timeZone) => timeZoneOption(timeZone))
      .sort(
        (left, right) =>
          left.city.localeCompare(right.city) ||
          left.value.localeCompare(right.value)
      )
  }, [resolvedSystemTimeZone, value])

  const selectedOption = useMemo(
    () => timeZoneOption(value === "system" ? resolvedSystemTimeZone : value),
    [resolvedSystemTimeZone, value]
  )
  const filteredOptions = useMemo(
    () => filterTimeZoneOptions(options, query),
    [options, query]
  )
  const systemOption = useMemo(
    () => timeZoneOption(resolvedSystemTimeZone),
    [resolvedSystemTimeZone]
  )
  const rows = useMemo(() => {
    const result: TimeZoneRow[] = []
    const currentSearchOption =
      value === "system"
        ? {
            ...selectedOption,
            searchText:
              `${selectedOption.searchText} ${t("System")} ${t("System time zone")}`.toLocaleLowerCase(),
          }
        : selectedOption
    const currentMatches =
      filterTimeZoneOptions([currentSearchOption], query).length > 0
    if (currentMatches) {
      result.push({
        key: "current",
        value,
        option: selectedOption,
        current: true,
      })
    }

    const alternatives: TimeZoneRow[] = []
    if (value !== "system") {
      const systemSelection = {
        ...systemOption,
        city: t("System"),
        offset: `${systemOption.city} · ${systemOption.offset}`,
        searchText:
          `${t("System")} ${t("System time zone")} ${systemOption.searchText}`.toLocaleLowerCase(),
      }
      if (filterTimeZoneOptions([systemSelection], query).length > 0) {
        alternatives.push({
          key: "system",
          value: "system",
          option: systemSelection,
        })
      }
    }
    alternatives.push(
      ...filteredOptions
        .filter((option) => option.value !== selectedOption.value)
        .map((option) => ({
          key: option.value,
          value: option.value,
          option,
        }))
    )
    if (alternatives[0]) {
      alternatives[0] = { ...alternatives[0], selectStart: true }
    }
    return [...result, ...alternatives]
  }, [filteredOptions, query, selectedOption, systemOption, t, value])

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    setQuery("")
    setActiveIndex(0)
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
  }, [])

  const choose = useCallback(
    (nextValue: string) => {
      if (nextValue !== value) onChange(nextValue)
      close()
    },
    [close, onChange, value]
  )

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      setPosition(positionForTrigger(triggerRef.current))
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    inputRef.current?.focus()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const handleViewportChange = () => updatePosition()
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        close(false)
      }
    }
    window.addEventListener("resize", handleViewportChange)
    window.addEventListener("scroll", handleViewportChange, true)
    document.addEventListener("pointerdown", handlePointerDown)
    return () => {
      window.removeEventListener("resize", handleViewportChange)
      window.removeEventListener("scroll", handleViewportChange, true)
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [close, open, updatePosition])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const option = document.getElementById(`${listboxId}-${activeIndex}`)
    option?.scrollIntoView?.({ block: "nearest" })
  }, [activeIndex, listboxId])

  const activeRow = rows[activeIndex]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="time-zone-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          if (open) close(false)
          else setOpen(true)
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="time-zone-trigger-copy">
          <strong>{selectedOption.city}</strong>
          <small>
            {selectedOption.offset}
            {value === "system" ? ` · ${t("System")}` : null}
          </small>
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              className="time-zone-popover"
              style={{
                left: position.left,
                top: position.top,
                bottom: position.bottom,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
            >
              <div className="time-zone-search">
                <Search aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="search"
                  role="combobox"
                  aria-label={t("Search cities and time zones")}
                  aria-controls={listboxId}
                  aria-expanded="true"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeRow ? `${listboxId}-${activeIndex}` : undefined
                  }
                  placeholder={t("Search cities, time zones…")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault()
                      setActiveIndex((current) =>
                        rows.length ? (current + 1) % rows.length : 0
                      )
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault()
                      setActiveIndex((current) =>
                        rows.length
                          ? (current - 1 + rows.length) % rows.length
                          : 0
                      )
                    } else if (event.key === "Enter") {
                      event.preventDefault()
                      if (activeRow) choose(activeRow.value)
                    } else if (event.key === "Escape") {
                      event.preventDefault()
                      close()
                    }
                  }}
                />
              </div>
              <div
                id={listboxId}
                className="time-zone-list"
                role="listbox"
                aria-label={label}
              >
                {rows.length === 0 ? (
                  <p className="time-zone-empty">
                    {t("No matching time zones")}
                  </p>
                ) : (
                  rows.map((row, index) => (
                    <div
                      key={row.key}
                      role="presentation"
                      className={
                        row.current || row.selectStart
                          ? "time-zone-section"
                          : undefined
                      }
                    >
                      {row.current ? (
                        <span className="time-zone-group-label">
                          {t("Current time zone")}
                        </span>
                      ) : row.selectStart ? (
                        <span className="time-zone-group-label">
                          {t("Select a time zone")}
                        </span>
                      ) : null}
                      <TimeZoneOptionRow
                        active={index === activeIndex}
                        checked={row.value === value}
                        id={`${listboxId}-${index}`}
                        option={row.option}
                        onHover={() => setActiveIndex(index)}
                        onSelect={() => choose(row.value)}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
