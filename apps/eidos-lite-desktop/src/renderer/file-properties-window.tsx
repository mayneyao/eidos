import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { FilePropertiesContent } from "./file-properties-content"
import type { FilePropertiesContentHandle } from "./file-properties-content"
import { useEidosLiteI18n } from "./i18n"
import type { ResolvedAppearance } from "./app-appearance"
import { hasSparkFeature } from "../shared/spark"
import { useAppTheme } from "./use-app-theme"

export function FilePropertiesApp() {
  const theme = useAppTheme()
  return <FilePropertiesWindow theme={theme} />
}

export function FilePropertiesWindow({ theme }: { theme: ResolvedAppearance }) {
  const { t } = useEidosLiteI18n()
  const [path, setPath] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [spacePath, setSpacePath] = useState<string | null>(null)
  const [targetLoaded, setTargetLoaded] = useState(false)
  const [sparkActive, setSparkActive] = useState(false)
  const windowContent = useRef<HTMLElement>(null)
  const contentRef = useRef<FilePropertiesContentHandle | null>(null)
  useEffect(() => {
    let active = true
    const refreshSpark = () => {
      try {
        const request = window.eidosLite.getSparkStatus?.(false)
        if (!request) {
          if (active) setSparkActive(false)
          return
        }
        void request
          .then((status) => {
            if (active) setSparkActive(hasSparkFeature(status, "file-metadata"))
          })
          .catch(() => {
            if (active) setSparkActive(false)
          })
      } catch {
        if (active) setSparkActive(false)
      }
    }
    refreshSpark()
    window.addEventListener("focus", refreshSpark)
    return () => {
      active = false
      window.removeEventListener("focus", refreshSpark)
    }
  }, [])
  useEffect(() => {
    let active = true
    void window.eidosLite
      .getSpace()
      .then((space) => {
        if (active) setSpacePath(space?.displayPath ?? "")
      })
      .catch(() => {
        if (active) setSpacePath("")
      })
    return () => {
      active = false
    }
  }, [])
  const [icon, setIcon] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    let active = true
    if (path)
      void window.eidosLite
        .getFilePropertiesIcon()
        .then((url) => {
          if (active && url) setIcon({ path, url })
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [path])
  const resize = useCallback((height: number) => {
    void window.eidosLite
      .resizeFileProperties(height)
      .catch((cause) => setError(String(cause)))
  }, [])
  const flushDrafts = useCallback(
    () => contentRef.current?.flushDrafts() ?? Promise.resolve(true),
    []
  )
  useEffect(() => {
    const stop = window.eidosLite.onFilePropertiesPrepareClose?.((token) => {
      void flushDrafts()
        .catch(() => false)
        .then((allowed) =>
          window.eidosLite.replyFilePropertiesClose?.(token, allowed)
        )
    })
    return stop
  }, [flushDrafts])
  useEffect(
    () =>
      window.eidosLite.onPreferencesChanged(() => {
        requestAnimationFrame(() => {
          if (windowContent.current)
            resize(windowContent.current.getBoundingClientRect().height)
        })
      }),
    [resize]
  )
  useLayoutEffect(() => {
    // Errors and an empty selection must also be presentable without waiting
    // for a form that will never load.
    if (!error && (!targetLoaded || path)) return
    const frame = requestAnimationFrame(() => {
      if (windowContent.current)
        resize(windowContent.current.getBoundingClientRect().height)
    })
    return () => cancelAnimationFrame(frame)
  }, [error, targetLoaded, path, resize])
  useEffect(() => {
    document.title = path
      ? `${path.split("/").at(-1)} — ${t("File properties")}`
      : t("File properties")
  }, [path, t])
  useEffect(() => {
    let active = true
    let received = false
    const stop = window.eidosLite.onFilePropertiesChanged((path) => {
      received = true
      if (active) {
        setPath(path)
        setTargetLoaded(true)
        setRevision((n) => n + 1)
      }
    })
    void window.eidosLite
      .getFilePropertiesTarget()
      .then((path) => {
        if (active && !received) {
          setPath(path)
          setTargetLoaded(true)
        }
      })
      .catch((cause) => {
        if (active) setError(String(cause))
      })
    return () => {
      active = false
      stop()
    }
  }, [])
  return (
    <main ref={windowContent} className="file-properties-window">
      {error ? (
        <p role="alert">{error}</p>
      ) : path && spacePath !== null ? (
        <FilePropertiesContent
          ref={contentRef}
          relativePath={path}
          theme={theme}
          disabled={false}
          readOnly={!sparkActive}
          refreshToken={revision}
          spacePath={spacePath}
          iconUrl={icon?.path === path ? icon.url : undefined}
          onContentHeight={resize}
          onChanged={() => {}}
          onReleaseEidosFile={async () => {
            /* The owning Space retains this shared catalog Runtime. */
          }}
          onClose={() => window.close()}
        />
      ) : targetLoaded && !path ? (
        <p className="file-properties-empty">
          {t("Select a file to view its properties.")}
        </p>
      ) : null}
    </main>
  )
}
