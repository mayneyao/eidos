import { useCallback, useEffect, useState } from "react"
import type { FileSpaceIndexStatus } from "@eidos.space/file-space"
import { DatabaseZap, LoaderCircle, RefreshCw, Search } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

function formatIndexedAt(value: number): string | null {
  if (!value) return null
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

export function FileSpaceIndexesSettings() {
  const { t } = useTranslation()
  const { currentSpace } = useCurrentSpace()
  const spaceId = currentSpace?.id
  const { getIndexStatus, rebuildIndex } = useSpaceFiles(spaceId)
  const [status, setStatus] = useState<FileSpaceIndexStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [rebuilding, setRebuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    if (!spaceId || currentSpace?.mode !== "file") return
    try {
      setStatus(await getIndexStatus())
      setError(null)
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to read index status"
      )
    } finally {
      setLoading(false)
    }
  }, [currentSpace?.mode, getIndexStatus, spaceId])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useSpaceFileChanges(
    spaceId,
    useCallback(() => void loadStatus(), [loadStatus])
  )

  if (!spaceId || currentSpace?.mode !== "file") return null

  const rebuild = async () => {
    setRebuilding(true)
    setError(null)
    try {
      setStatus(await rebuildIndex())
    } catch (rebuildError) {
      setError(
        rebuildError instanceof Error
          ? rebuildError.message
          : "Unable to rebuild the index"
      )
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <div className="space-y-0" data-settings-row-groups="true">
      <div className="pb-2">
        <h3>{t("space.settings.fileSpace.indexes.group", "Derived index")}</h3>
      </div>
      <hr />
      <div>
        <div className="divide-y divide-border/70">
          <div className="flex min-h-[76px] items-center justify-between gap-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label>
                  {t(
                    "space.settings.fileSpace.indexes.coverage",
                    "Search coverage"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.indexes.coverageDescription",
                    "Files remain the source of truth. Search, tags, links, headings, and backlinks are derived and rebuildable."
                  )}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right text-sm tabular-nums">
              {loading && !status ? (
                <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div>
                    {t(
                      "space.settings.fileSpace.indexes.textFiles",
                      "{{count}} text files",
                      { count: status?.contentFileCount ?? 0 }
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t(
                      "space.settings.fileSpace.indexes.filesDiscovered",
                      "{{count}} files discovered",
                      { count: status?.fileCount ?? 0 }
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex min-h-[76px] items-center justify-between gap-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label>
                  {t(
                    "space.settings.fileSpace.indexes.rebuild",
                    "Rebuild index"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.indexes.lastBuilt",
                    "Last built {{date}}",
                    {
                      date:
                        formatIndexedAt(status?.indexedAt ?? 0) ??
                        t(
                          "space.settings.fileSpace.indexes.notBuilt",
                          "not yet"
                        ),
                    }
                  )}
                  {(status?.skippedContentFileCount ?? 0) > 0
                    ? t(
                        "space.settings.fileSpace.indexes.skipped",
                        " · {{count}} large or unsupported files skipped",
                        { count: status?.skippedContentFileCount }
                      )
                    : ""}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={rebuilding}
              onClick={() => void rebuild()}
            >
              {rebuilding ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {rebuilding
                ? t(
                    "space.settings.fileSpace.indexes.rebuilding",
                    "Rebuilding…"
                  )
                : t(
                    "space.settings.fileSpace.indexes.rebuildAction",
                    "Rebuild"
                  )}
            </Button>
          </div>
        </div>
        {error ? (
          <p className="border-t border-destructive/20 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
