import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Cloud, Loader2, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useAuthOptional } from "@/components/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface OfficialSyncStatus {
  namespace: string
  repositories: Array<{ name: string; remoteUrl: string }>
  discovery: {
    service: string
    protocol: string
    version: number
  }
}

export function GlobalSyncSettings() {
  const { t } = useTranslation()
  const { navigate } = useRouterAdapter()
  const auth = useAuthOptional()
  const [status, setStatus] = useState<OfficialSyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isDesktopMode || !auth?.isAuthenticated) return
    setLoading(true)
    setError(null)
    try {
      const next = await window.eidos.credentials.getOfficialSyncStatus()
      setStatus(next as OfficialSyncStatus)
    } catch (cause) {
      setStatus(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [auth?.isAuthenticated])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!isDesktopMode) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          "settings.sync.desktopOnly",
          "Eidos Sync is available in the desktop app."
        )}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          {t("settings.sync.title", "Eidos Sync")}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t(
            "settings.sync.officialDescription",
            "Sync committed Space versions through the official Eidos Graft Remote v1 service. Authentication follows your eidos.space account; no storage keys or endpoints are required."
          )}
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">sync.eidos.space</span>
                <Badge variant={status ? "secondary" : "outline"}>
                  {status ? "Connected" : "Not connected"}
                </Badge>
              </div>
              {status ? (
                <p className="text-sm text-muted-foreground">
                  <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-500" />
                  Remote v{status.discovery.version} ·{" "}
                  {status.repositories.length}{" "}
                  {status.repositories.length === 1
                    ? "repository"
                    : "repositories"}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sign in to use the official sync service.
                </p>
              )}
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
          {auth?.isAuthenticated ? (
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void refresh()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate("/settings/account")}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
