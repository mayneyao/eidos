import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useEidosFileUI } from "./context"

export interface MobileRecordRoute {
  file: string
  tableId: string
  rowId: string
}

export function mobileRecordUrl(route: MobileRecordRoute): string {
  return (
    "#/records/" +
    [route.file, route.tableId, route.rowId].map(encodeURIComponent).join("/")
  )
}

export function parseMobileRecordUrl(
  hash: string,
  file: string
): MobileRecordRoute | null {
  const match = /^#\/records\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(hash)
  if (!match) return null
  try {
    const [path, tableId, rowId] = match.slice(1).map(decodeURIComponent)
    return path === file && tableId && rowId
      ? { file: path, tableId, rowId }
      : null
  } catch {
    return null
  }
}

/** A file-scoped page route. The table remains mounted behind the route outlet. */
export function useMobileRecordRoute(
  file: string,
  notify: (active: boolean) => Promise<unknown>,
  onError: (error: unknown) => void
) {
  const [route, setRoute] = useState(() =>
    parseMobileRecordUrl(location.hash, file)
  )
  const notifyRef = useRef(notify)
  const errorRef = useRef(onError)
  notifyRef.current = notify
  errorRef.current = onError
  useEffect(() => {
    const read = () => setRoute(parseMobileRecordUrl(location.hash, file))
    read()
    window.addEventListener("popstate", read)
    window.addEventListener("hashchange", read)
    return () => {
      window.removeEventListener("popstate", read)
      window.removeEventListener("hashchange", read)
    }
  }, [file])
  useEffect(() => {
    void notifyRef
      .current(Boolean(route))
      .catch((error) => errorRef.current(error))
  }, [Boolean(route)])
  return {
    route,
    open: (tableId: string, rowId: string) => {
      const next = { file, tableId, rowId }
      if (route) history.replaceState(history.state, "", mobileRecordUrl(next))
      else
        history.pushState({ eidosRecordPage: true }, "", mobileRecordUrl(next))
      setRoute(next)
    },
    close: () => {
      if (!route) return
      if (history.state?.eidosRecordPage) history.back()
      else {
        history.replaceState(null, "", location.pathname + location.search)
        setRoute(null)
      }
    },
  }
}

export function MobileRecordPage({ children }: { children: ReactNode }) {
  const { themeName } = useEidosFileUI()
  return createPortal(
    <div
      data-eidos-file-root=""
      data-theme={themeName}
      data-mobile-record-page=""
      className="fixed inset-0 z-[100] bg-background text-foreground"
    >
      {children}
    </div>,
    document.body
  )
}
