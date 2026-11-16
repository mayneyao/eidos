import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { Search, X } from "lucide-react"
import { useEidosLiteI18n } from "./i18n"
import {
  searchSettings,
  SETTINGS_SECTIONS,
  type SettingDescriptor,
} from "./settings-catalog"

interface SettingsSearchProps {
  descriptors: readonly SettingDescriptor[]
  inputRef: RefObject<HTMLInputElement>
  navigationVersion: number
  catalogState: "loading" | "ready" | "error"
  onRetry(): void
  onNavigate(setting: SettingDescriptor): void
}

export function SettingsSearch({
  descriptors,
  inputRef,
  navigationVersion,
  catalogState,
  onRetry,
  onNavigate,
}: SettingsSearchProps) {
  const { t } = useEidosLiteI18n()
  const listId = useId()
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const composing = useRef(false)
  const compositionEndedAt = useRef(-Infinity)
  const [query, setQuery] = useState("")
  const [matchQuery, setMatchQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const results = useMemo(
    () => searchSettings(descriptors, matchQuery),
    [descriptors, matchQuery]
  )
  const activeIndex = Math.max(
    0,
    results.findIndex((result) => result.id === activeId)
  )
  const active = results[activeIndex]
  const expanded = open && query.trim().length > 0

  useEffect(() => setOpen(false), [navigationVersion])
  useLayoutEffect(() => {
    if (!expanded || !list.current) return
    const option = list.current.children[activeIndex] as HTMLElement | undefined
    if (!option) return
    const top = option.offsetTop
    const bottom = top + option.offsetHeight
    if (top < list.current.scrollTop) list.current.scrollTop = top
    else if (bottom > list.current.scrollTop + list.current.clientHeight)
      list.current.scrollTop = bottom - list.current.clientHeight
  }, [activeIndex, expanded])

  const clear = () => {
    setQuery("")
    setMatchQuery("")
    setActiveId(null)
    setOpen(false)
    inputRef.current?.focus()
  }
  const choose = (setting: SettingDescriptor) => {
    setOpen(false)
    onNavigate(setting)
  }
  return (
    <div
      className="settings-search"
      data-settings-search
      ref={root}
      onKeyDown={(event) => {
        if (
          event.target !== inputRef.current &&
          event.key === "Escape" &&
          !event.nativeEvent.isComposing &&
          event.keyCode !== 229
        ) {
          event.preventDefault()
          event.stopPropagation()
          clear()
        }
      }}
      onBlurCapture={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null))
          setOpen(false)
      }}
    >
      <div className="settings-search-field">
        <Search aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={t("Search settings")}
          placeholder={t("Search settings")}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={
            expanded && active ? listId + "-" + active.id : undefined
          }
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            if (!composing.current) setMatchQuery(event.currentTarget.value)
            setActiveId(null)
            setOpen(true)
          }}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={(event) => {
            composing.current = false
            compositionEndedAt.current = performance.now()
            setQuery(event.currentTarget.value)
            setMatchQuery(event.currentTarget.value)
            setActiveId(null)
          }}
          onKeyUp={(event) => {
            if (["Enter", "Escape", "ArrowDown", "ArrowUp"].includes(event.key))
              compositionEndedAt.current = -Infinity
          }}
          onKeyDown={(event) => {
            if (
              composing.current ||
              event.nativeEvent.isComposing ||
              event.keyCode === 229
            )
              return
            if (
              ["Enter", "Escape", "ArrowDown", "ArrowUp"].includes(event.key) &&
              performance.now() - compositionEndedAt.current < 50
            ) {
              event.preventDefault()
              return
            }
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              clear()
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              if (!results.length || !query.trim()) return
              event.preventDefault()
              const delta = event.key === "ArrowDown" ? 1 : -1
              const index = !expanded
                ? delta > 0
                  ? 0
                  : results.length - 1
                : (activeIndex + delta + results.length) % results.length
              setOpen(true)
              setActiveId(results[index]!.id)
            } else if (event.key === "Enter" && expanded) {
              event.preventDefault()
              event.stopPropagation()
              if (active) choose(active)
            }
          }}
        />
        {query ? (
          <button type="button" aria-label={t("Clear search")} onClick={clear}>
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="settings-search-results">
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={t("Settings search results")}
          >
            {results.map((setting, index) => (
              <li
                key={setting.id}
                id={listId + "-" + setting.id}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  if (event.button === 0) event.preventDefault()
                }}
                onMouseMove={() => setActiveId(setting.id)}
                onClick={() => choose(setting)}
              >
                <span className="settings-search-result-heading">
                  <strong>{t(setting.title, setting.values)}</strong>
                  <span>
                    {t(
                      SETTINGS_SECTIONS.find(
                        (section) => section.id === setting.pageId
                      )!.label
                    )}
                    {setting.group ? " › " + t(setting.group) : ""}
                  </span>
                </span>
                {setting.summary ? (
                  <small>{t(setting.summary, setting.values)}</small>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="settings-search-status" role="status">
            {results.length
              ? t("{count} matching settings", { count: results.length })
              : t("No matching settings")}
          </p>
          {catalogState !== "ready" ? (
            <p className="settings-search-status" role="status">
              {t(
                catalogState === "loading"
                  ? "Reading file editor settings…"
                  : "File editor settings are unavailable."
              )}
              {catalogState === "error" ? (
                <button type="button" onClick={onRetry}>
                  {t("Retry")}
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function isSettingsSearchShortcut(
  event: {
    key: string
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
    defaultPrevented: boolean
    isComposing: boolean
    keyCode?: number
  },
  target: EventTarget | null,
  searchInput: HTMLInputElement | null,
  macos: boolean
): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== "f" ||
    (macos ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey)
  )
    return false
  if (target === searchInput) return true
  return !(
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-recording="true"], [role="dialog"], [role="listbox"]'
    )
  )
}
