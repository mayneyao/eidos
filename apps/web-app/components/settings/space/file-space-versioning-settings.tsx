import { useEffect, useState } from "react"
import {
  CloudCog,
  GitBranch,
  History,
  Link2Off,
  LoaderCircle,
  MessageSquareText,
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
import { Switch } from "@/components/ui/switch"

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
    getAgentConversationVersioning,
    setAgentConversationVersioning,
    getRemotes,
    configureRemote,
    removeRemote,
    refresh,
  } = useSpaceVersioning(spaceId)
  const [remoteUrl, setRemoteUrl] = useState("")
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [agentConversationsVersioned, setAgentConversationsVersioned] =
    useState(false)
  const [agentPolicyLoading, setAgentPolicyLoading] = useState(true)
  const [agentPolicySaving, setAgentPolicySaving] = useState(false)
  const [agentPolicyError, setAgentPolicyError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!spaceId || !status?.enabled || !getRemotes) return
    void getRemotes()
      .then((remotes) => {
        if (cancelled) return
        const origin = remotes.find((remote) => remote.name === "origin")
        const url = origin?.url ?? remotes[0]?.url ?? ""
        setRemoteUrl(url)
        setRemoteError(null)
      })
      .catch((remoteRequestError) => {
        if (!cancelled) {
          setRemoteError(
            remoteRequestError instanceof Error
              ? remoteRequestError.message
              : String(remoteRequestError)
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [getRemotes, spaceId, status?.enabled, status?.remoteNames?.length])

  useEffect(() => {
    let cancelled = false
    if (!spaceId || !available) {
      setAgentPolicyLoading(false)
      setAgentConversationsVersioned(false)
      return
    }
    setAgentPolicyLoading(true)
    void getAgentConversationVersioning()
      .then((policy) => {
        if (!cancelled) {
          setAgentConversationsVersioned(policy.enabled)
          setAgentPolicyError(null)
        }
      })
      .catch((policyError) => {
        if (!cancelled) {
          setAgentPolicyError(
            policyError instanceof Error
              ? policyError.message
              : String(policyError)
          )
        }
      })
      .finally(() => {
        if (!cancelled) setAgentPolicyLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [available, getAgentConversationVersioning, spaceId])

  if (!spaceId || currentSpace?.mode !== "file") return null

  const enabled = status?.enabled === true
  const busy = statusLoading || operation !== null
  const remoteConfigured = (status?.remoteNames?.length ?? 0) > 0
  const saveRemote = async () => {
    setRemoteError(null)
    try {
      await configureRemote({})
    } catch (remoteRequestError) {
      setRemoteError(
        remoteRequestError instanceof Error
          ? remoteRequestError.message
          : String(remoteRequestError)
      )
    }
  }
  const disconnectRemote = async () => {
    setRemoteError(null)
    try {
      await removeRemote("origin")
      setRemoteUrl("")
    } catch (remoteRequestError) {
      setRemoteError(
        remoteRequestError instanceof Error
          ? remoteRequestError.message
          : String(remoteRequestError)
      )
    }
  }
  const updateAgentConversationVersioning = async (enabled: boolean) => {
    const previous = agentConversationsVersioned
    setAgentConversationsVersioned(enabled)
    setAgentPolicySaving(true)
    setAgentPolicyError(null)
    try {
      const policy = await setAgentConversationVersioning(enabled)
      setAgentConversationsVersioned(policy.enabled)
    } catch (policyError) {
      setAgentConversationsVersioned(previous)
      setAgentPolicyError(
        policyError instanceof Error ? policyError.message : String(policyError)
      )
    } finally {
      setAgentPolicySaving(false)
    }
  }

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
                    "User files are tracked broadly. Private runtime data under .eidos stays excluded; Agent conversations are controlled separately below."
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
          <div className="flex min-h-[92px] items-center justify-between gap-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="version-agent-conversations">
                    {t(
                      "space.settings.fileSpace.versioning.agentConversations",
                      "Version Agent conversations"
                    )}
                  </Label>
                  <Badge
                    variant={
                      agentConversationsVersioned ? "secondary" : "outline"
                    }
                  >
                    {agentConversationsVersioned
                      ? t(
                          "space.settings.fileSpace.versioning.agentConversationsIncluded",
                          "Included"
                        )
                      : t(
                          "space.settings.fileSpace.versioning.agentConversationsPrivate",
                          "Private"
                        )}
                  </Badge>
                  {agentPolicySaving ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
                <p className="max-w-3xl text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.versioning.agentConversationsDescription",
                    "Off by default. When enabled, transcripts, attached context, tool results, approvals, and attachments become regular Space changes and may be pushed to remotes. Turning this off removes them from the current staged selection but does not erase versions already committed."
                  )}
                </p>
                {!enabled ? (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "space.settings.fileSpace.versioning.agentConversationsRequiresVersioning",
                      "Enable versioning for this Space before including conversations."
                    )}
                  </p>
                ) : agentPolicyError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {agentPolicyError}
                  </p>
                ) : null}
              </div>
            </div>
            <Switch
              id="version-agent-conversations"
              checked={agentConversationsVersioned}
              disabled={
                !available ||
                !enabled ||
                busy ||
                agentPolicyLoading ||
                agentPolicySaving
              }
              aria-label={t(
                "space.settings.fileSpace.versioning.agentConversations",
                "Version Agent conversations"
              )}
              aria-busy={agentPolicySaving}
              onCheckedChange={(checked) =>
                void updateAgentConversationVersioning(checked)
              }
            />
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
      <div className="pt-10">
        <div className="pb-2">
          <h3>Remote sync</h3>
        </div>
        <hr />
        <div className="divide-y divide-border/70">
          <div className="flex min-h-[92px] items-start justify-between gap-6 py-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <CloudCog className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Label>Eidos Sync</Label>
                    <Badge variant={remoteConfigured ? "secondary" : "outline"}>
                      {remoteConfigured ? "Connected" : "Local only"}
                    </Badge>
                  </div>
                  <p className="text-sm leading-5 text-muted-foreground">
                    Push and pull committed Space versions through the official
                    Eidos Sync service. The Desktop provisions and configures
                    the Remote v1 URL automatically.
                  </p>
                </div>
                {remoteUrl ? (
                  <code className="block max-w-xl truncate rounded bg-muted px-2 py-1 text-xs">
                    {remoteUrl}
                  </code>
                ) : null}
                {!status?.head && enabled ? (
                  <p className="text-xs text-muted-foreground">
                    Create the first version before connecting a remote.
                  </p>
                ) : null}
                {remoteError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {remoteError}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {remoteConfigured ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void disconnectRemote()}
                >
                  <Link2Off className="h-4 w-4" />
                  Disconnect
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={!enabled || !status?.head || remoteConfigured || busy}
                onClick={() => void saveRemote()}
              >
                {operation === "configuring-remote" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudCog className="h-4 w-4" />
                )}
                Connect Eidos Sync
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
