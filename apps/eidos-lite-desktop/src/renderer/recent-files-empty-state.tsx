import { Database, FileText, LoaderCircle } from "lucide-react"

import { useEidosLiteI18n } from "./i18n"
import type { RecentFileEntry } from "./recent-files"

function parentPath(relativePath: string): string | null {
  const parent = relativePath.split("/").slice(0, -1).join("/")
  return parent || null
}

export function RecentFilesEmptyState({
  files,
  busyPath,
  onOpen,
}: {
  files: readonly RecentFileEntry[]
  busyPath: string | null
  onOpen(file: RecentFileEntry): void
}) {
  const { t } = useEidosLiteI18n()

  return (
    <section
      className="recent-files-empty-state"
      aria-labelledby="recent-files-heading"
      data-recent-files-empty-state
    >
      <h2 id="recent-files-heading">{t("Recent files")}</h2>
      {files.length ? (
        <ul className="recent-file-list">
          {files.map((file) => {
            const loading = busyPath === file.relativePath
            const location = parentPath(file.relativePath)
            return (
              <li key={file.relativePath}>
                <button
                  type="button"
                  disabled={busyPath !== null}
                  data-recent-file-path={file.relativePath}
                  data-recent-file-kind={file.kind}
                  aria-label={t("Open {name}", { name: file.name })}
                  title={file.relativePath}
                  onClick={() => onOpen(file)}
                >
                  <span className="recent-file-icon" aria-hidden="true">
                    {loading ? (
                      <LoaderCircle className="spin" />
                    ) : file.kind === "eidos" ? (
                      <Database />
                    ) : (
                      <FileText />
                    )}
                  </span>
                  <span className="recent-file-copy">
                    <strong>{file.name}</strong>
                    <small>{location ?? t("Space root")}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p>{t("Open a file from the Space Explorer to start working.")}</p>
      )}
    </section>
  )
}
