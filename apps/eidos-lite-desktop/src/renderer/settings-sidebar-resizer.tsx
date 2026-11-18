import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useEidosLiteI18n } from "./i18n"

const DEFAULT_WIDTH = 200
const MIN_WIDTH = 180
const MAX_WIDTH = 420
const CONTENT_MIN_WIDTH = 320
export const SETTINGS_SIDEBAR_WIDTH_KEY = "eidos-lite:settings-sidebar-width"
const RESIZE_LABELS = {
  en: "Resize settings sidebar",
  zh: "调整设置侧边栏宽度",
} as const

function storedWidth(): number {
  try {
    const value = window.localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY)
    const width = value === null ? NaN : Number(value)
    if (Number.isFinite(width))
      return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width))
  } catch {
    // Resizing remains available when local UI storage is unavailable.
  }
  return DEFAULT_WIDTH
}

function rememberWidth(width: number) {
  try {
    window.localStorage.setItem(SETTINGS_SIDEBAR_WIDTH_KEY, String(width))
  } catch {
    // The current window can still use the selected width.
  }
}

function settingsSurface(element: HTMLElement | null): HTMLElement | null {
  return (
    element?.closest<HTMLElement>(".settings-shell") ??
    element?.closest<HTMLElement>(".settings-layout") ??
    null
  )
}

/** Own layout state here so resizing never remounts Settings forms or search. */
export function SettingsSidebarResizer() {
  const { locale } = useEidosLiteI18n()
  const separator = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(storedWidth)
  const [maximum, setMaximum] = useState(MAX_WIDTH)
  const [resizing, setResizing] = useState(false)
  const preferred = useRef(width)
  const renderedWidth = useRef(width)
  const drag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    preferredWidth: number
  } | null>(null)

  const applyWidth = useCallback(
    (value: number, updatePreference = true): number => {
      const layout = settingsSurface(separator.current)
      const available = layout?.clientWidth || window.innerWidth
      const limit = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, available - CONTENT_MIN_WIDTH)
      )
      const next = Math.round(Math.min(limit, Math.max(MIN_WIDTH, value)))
      if (updatePreference) preferred.current = next
      renderedWidth.current = next
      layout?.style.setProperty("--settings-sidebar-width", next + "px")
      setWidth(next)
      setMaximum(limit)
      return next
    },
    []
  )

  const finish = useCallback(
    (commit: boolean) => {
      const current = drag.current
      if (!current) return
      drag.current = null
      if (commit) rememberWidth(preferred.current)
      else {
        preferred.current = current.preferredWidth
        applyWidth(preferred.current, false)
      }
      setResizing(false)
      if (separator.current?.hasPointerCapture(current.pointerId))
        separator.current.releasePointerCapture(current.pointerId)
    },
    [applyWidth]
  )

  useLayoutEffect(() => {
    const layout = settingsSurface(separator.current)
    const fit = () => {
      applyWidth(preferred.current, false)
    }
    fit()
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit)
    if (layout) observer?.observe(layout)
    window.addEventListener("resize", fit)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, [applyWidth])

  useEffect(() => {
    const cancel = () => finish(false)
    const escape = (event: KeyboardEvent) => {
      if (
        !drag.current ||
        event.key !== "Escape" ||
        event.isComposing ||
        event.keyCode === 229
      )
        return
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
    window.addEventListener("blur", cancel)
    window.addEventListener("keydown", escape, true)
    const element = separator.current
    return () => {
      window.removeEventListener("blur", cancel)
      window.removeEventListener("keydown", escape, true)
      const current = drag.current
      drag.current = null
      if (current && element?.hasPointerCapture(current.pointerId))
        element.releasePointerCapture(current.pointerId)
    }
  }, [finish])

  return (
    <div
      ref={separator}
      className="settings-sidebar-resizer"
      role="separator"
      aria-label={RESIZE_LABELS[locale]}
      aria-controls="settings-sidebar"
      aria-orientation="vertical"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={maximum}
      aria-valuenow={width}
      tabIndex={0}
      data-resizing={resizing ? "true" : "false"}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.isPrimary === false || drag.current)
          return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: renderedWidth.current,
          preferredWidth: preferred.current,
        }
        setResizing(true)
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || current.pointerId !== event.pointerId) return
        applyWidth(current.startWidth + event.clientX - current.startX)
      }}
      onPointerUp={(event) => {
        const current = drag.current
        if (current?.pointerId === event.pointerId) {
          applyWidth(current.startWidth + event.clientX - current.startX)
          finish(true)
        }
      }}
      onPointerCancel={(event) => {
        if (drag.current?.pointerId === event.pointerId) finish(false)
      }}
      onLostPointerCapture={() => finish(false)}
      onDoubleClick={() => {
        rememberWidth(applyWidth(DEFAULT_WIDTH))
      }}
      onKeyDown={(event) => {
        if (
          event.nativeEvent.isComposing ||
          event.keyCode === 229 ||
          drag.current
        )
          return
        const step = event.shiftKey ? 32 : 16
        const next =
          event.key === "ArrowLeft"
            ? renderedWidth.current - step
            : event.key === "ArrowRight"
              ? renderedWidth.current + step
              : event.key === "Home"
                ? MIN_WIDTH
                : event.key === "End"
                  ? maximum
                  : null
        if (next === null) return
        event.preventDefault()
        rememberWidth(applyWidth(next))
      }}
    />
  )
}
