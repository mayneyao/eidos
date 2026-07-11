import {
  GitBranch,
  History,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSpaceVersioning } from "@/apps/web-app/hooks/use-space-versioning"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export function FileSpaceVersioningSettings() {
  const { t } = useTranslation()
  const { currentSpace } = useCurrentSpace()
  const spaceId = currentSpace?.id
  const { navigate } = useRouterAdapter()
  const {
    status,
    statusLoading,
    operation,
    error,
    available,
    enable,
    refresh,
  } = useSpaceVersioning(spaceId)

  if (!spaceId || currentSpace?.mode !== "file") return null

  const enabled = status?.enabled === true
  const busy = statusLoading || operation !== null

  return (
    <div className="space-y-0" data-settings-row-groups="true">
      <div className="pb-2">
        <h3>
          {t("space.settings.fileSpace.versioning.group", "Local history")}
        </h3>
      </div>
      <hr />
      <div>
        <div className="divide-y divide-border/70">
          <div className="flex min-h-[76px] items-center justify-between gap-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label>
                    {t(
                      "space.settings.fileSpace.versioning.enable",
                      "Version this Space"
                    )}
                  </Label>
                  <Badge variant={enabled ? "secondary" : "outline"}>
                    {enabled
                      ? t(
                          "space.settings.fileSpace.versioning.enabled",
                          "Enabled"
                        )
                      : t(
                          "space.settings.fileSpace.versioning.notEnabled",
                          "Not enabled"
                        )}
                  </Badge>
                </div>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.versioning.description",
                    "Graft records versions at the Space root while files remain directly editable outside Eidos."
                  )}
                </p>
              </div>
            </div>
            {enabled ? (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() =>
                  navigate("/version/history", { target: "_blank" })
                }
              >
                <History className="h-4 w-4" />
                {t(
                  "space.settings.fileSpace.versioning.openHistory",
                  "Open history"
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                className="shrink-0"
                disabled={!available || busy}
                onClick={() => void enable()}
              >
                {operation === "enabling" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <GitBranch className="h-4 w-4" />
                )}
                {operation === "enabling"
                  ? t(
                      "space.settings.fileSpace.versioning.enabling",
                      "Enabling…"
                    )
                  : t(
                      "space.settings.fileSpace.versioning.enableAction",
                      "Enable"
                    )}
              </Button>
            )}
          </div>
          <div className="flex min-h-[76px] items-center justify-between gap-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label>
                  {t(
                    "space.settings.fileSpace.versioning.policy",
                    "Tracking policy"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.versioning.policyDescription",
                    "User files are tracked broadly. Private caches, sessions, indexes, state, and secrets under .eidos are excluded."
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={!available || busy}
              onClick={() => void refresh()}
            >
              <RefreshCw className="h-4 w-4" />
              {t("space.settings.fileSpace.versioning.refresh", "Refresh")}
            </Button>
          </div>
        </div>
        {!available ? (
          <p className="border-t border-border/70 py-3 text-sm text-muted-foreground">
            {t(
              "space.settings.fileSpace.versioning.desktopOnly",
              "Open this Space in the desktop app to configure Graft."
            )}
          </p>
        ) : error ? (
          <p className="border-t border-destructive/20 py-3 text-sm text-destructive">
            {error.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
