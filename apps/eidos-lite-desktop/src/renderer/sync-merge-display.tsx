import { useSyncExternalStore } from "react"
import { Columns3 } from "lucide-react"
import { useEidosLiteI18n } from "./i18n"

const STORAGE_KEY = "eidos-lite:merge-show-base"
const listeners = new Set<() => void>()
let fallbackShowBase = false
let useFallback = false

function readShowBase(): boolean {
  if (useFallback) return fallbackShowBase
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return fallbackShowBase
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function setShowBase(showBase: boolean) {
  fallbackShowBase = showBase
  try {
    window.localStorage.setItem(STORAGE_KEY, String(showBase))
    useFallback = false
  } catch {
    // Keep the shared in-memory preference when storage is unavailable.
    useFallback = true
  }
  listeners.forEach((listener) => listener())
}

export function useSyncMergeShowBase(): boolean {
  return useSyncExternalStore(subscribe, readShowBase, () => false)
}

export function MergeDisplayOptions() {
  const { t } = useEidosLiteI18n()
  const showBase = useSyncMergeShowBase()
  return (
    <button
      type="button"
      className="icon-button sync-merge-display-toggle"
      aria-label={t("Show Base")}
      title={t(showBase ? "Hide Base" : "Show Base")}
      aria-pressed={showBase}
      onClick={() => setShowBase(!showBase)}
    >
      <Columns3 aria-hidden="true" />
    </button>
  )
}
