import { useRef, useState, type ReactNode } from "react"
import { Download } from "lucide-react"
import { useEidosLiteI18n } from "./i18n"

export function PluginDropZone({
  children,
  busy,
  install,
}: {
  children: ReactNode
  busy: boolean
  install(files: File[]): Promise<void>
}) {
  const { t } = useEidosLiteI18n()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const depth = useRef(0)
  const installing = useRef(false)
  return (
    <div
      className="plugin-drop-zone"
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        event.stopPropagation()
        depth.current++
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect =
          busy || installing.current ? "none" : "copy"
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        depth.current = Math.max(0, depth.current - 1)
        if (!depth.current) setDragging(false)
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        event.stopPropagation()
        depth.current = 0
        setDragging(false)
        if (busy || installing.current) return
        const files = Array.from(event.dataTransfer.files)
        if (
          !files.length ||
          files.some(
            (file) => !file.name.toLowerCase().endsWith(".eidos-plugin")
          )
        ) {
          setError(t("Drop .eidos-plugin files to install or update plugins."))
          return
        }
        setError(null)
        installing.current = true
        void install(files)
          .catch((error: unknown) => {
            setError(error instanceof Error ? error.message : String(error))
          })
          .finally(() => {
            installing.current = false
          })
      }}
    >
      {children}
      {error && (
        <p role="alert" className="plugin-drop-error">
          {error}
        </p>
      )}
      {dragging && (
        <div className="plugin-drop-overlay" role="status">
          <Download size={28} aria-hidden="true" />
          <strong>
            {busy || installing.current
              ? t("Installing…")
              : t("Drop to install or update")}
          </strong>
          <span>.eidos-plugin</span>
        </div>
      )}
    </div>
  )
}
