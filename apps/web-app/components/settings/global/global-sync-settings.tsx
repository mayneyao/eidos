import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Cloud, Loader2, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useAuthOptional } from "@/components/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { SettingsRow, SettingsRows, SettingsSection } from "../settings-surface"

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
    <SettingsSection
      title={t("settings.sync.title", "Eidos Sync")}
      description={t(
        "settings.sync.officialDescription",
        "Sync committed Space versions through the official Eidos Graft Remote v1 service. Authentication follows your eidos.space account; no storage keys or endpoints are required."
      )}
    >
      <SettingsRows>
        <SettingsRow
          icon={<Cloud />}
          title={
            <span className="flex items-center gap-2">
              sync.eidos.space
              <Badge variant={status ? "secondary" : "outline"}>
                {status ? "Connected" : "Not connected"}
              </Badge>
            </span>
          }
          description={
            <>
              {status ? (
                <span className="block">
                  <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-500" />
                  Remote v{status.discovery.version} ·{" "}
                  {status.repositories.length}{" "}
                  {status.repositories.length === 1
                    ? "repository"
                    : "repositories"}
                </span>
              ) : (
                <span className="block">
                  Sign in to use the official sync service.
                </span>
              )}
              {error ? (
                <span className="block text-destructive" role="alert">
                  {error}
                </span>
              ) : null}
            </>
          }
        >
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
        </SettingsRow>
      </SettingsRows>
    </SettingsSection>
  )
}
