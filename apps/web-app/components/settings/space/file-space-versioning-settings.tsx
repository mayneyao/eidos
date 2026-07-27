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
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

import { SettingsRow, SettingsRows, SettingsSection } from "../settings-surface"

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
  const [savedRemoteUrl, setSavedRemoteUrl] = useState("")
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
        setSavedRemoteUrl(url)
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
      await configureRemote({ url: remoteUrl })
      setSavedRemoteUrl(remoteUrl.trim())
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
      setSavedRemoteUrl("")
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
    <div className="space-y-8">
      <SettingsSection
        title={t("space.settings.fileSpace.versioning.group", "Local history")}
      >
        <SettingsRows>
          <SettingsRow
            icon={<GitBranch />}
            title={
              <span className="flex items-center gap-2">
                {t(
                  "space.settings.fileSpace.versioning.enable",
                  "Version this Space"
                )}
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
              </span>
            }
            description={t(
              "space.settings.fileSpace.versioning.description",
              "Graft records versions at the Space root while files remain directly editable outside Eidos."
            )}
          >
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
          </SettingsRow>
          <SettingsRow
            icon={<ShieldCheck />}
            title={t(
              "space.settings.fileSpace.versioning.policy",
              "Tracking policy"
            )}
            description={t(
              "space.settings.fileSpace.versioning.policyDescription",
              "User files are tracked broadly. Private runtime data under .eidos stays excluded; Agent conversations are controlled separately below."
            )}
          >
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
          </SettingsRow>
          <SettingsRow
            icon={<MessageSquareText />}
            htmlFor="version-agent-conversations"
            className="min-h-[92px]"
            title={
              <span className="flex items-center gap-2">
                {t(
                  "space.settings.fileSpace.versioning.agentConversations",
                  "Version Agent conversations"
                )}
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
              </span>
            }
            description={
              <>
                <span className="block max-w-3xl">
                  {t(
                    "space.settings.fileSpace.versioning.agentConversationsDescription",
                    "Off by default. When enabled, transcripts, attached context, tool results, approvals, and attachments become regular Space changes and may be pushed to remotes. Turning this off removes them from the current staged selection but does not erase versions already committed."
                  )}
                </span>
                {!enabled ? (
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "space.settings.fileSpace.versioning.agentConversationsRequiresVersioning",
                      "Enable versioning for this Space before including conversations."
                    )}
                  </span>
                ) : agentPolicyError ? (
                  <span className="block text-xs text-destructive" role="alert">
                    {agentPolicyError}
                  </span>
                ) : null}
              </>
            }
          >
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
          </SettingsRow>
        </SettingsRows>
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
      </SettingsSection>

      <SettingsSection title="Remote sync">
        <SettingsRows>
          <SettingsRow
            icon={<CloudCog />}
            htmlFor="file-space-graft-remote"
            className="min-h-[92px] items-start"
            title={
              <span className="flex items-center gap-2">
                Graft remote
                <Badge variant={remoteConfigured ? "secondary" : "outline"}>
                  {remoteConfigured ? "Connected" : "Local only"}
                </Badge>
              </span>
            }
            description={
              <>
                <span className="block">
                  Push and pull committed Space versions through a Graft remote.
                  Local file changes are never uploaded until they are
                  committed.
                </span>
                <Input
                  id="file-space-graft-remote"
                  value={remoteUrl}
                  className="mt-2 max-w-xl font-mono text-xs"
                  placeholder="fs:///path/to/remote or graft+https://…"
                  disabled={!enabled || busy}
                  onChange={(event) => setRemoteUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void saveRemote()
                    }
                  }}
                />
                {!status?.head && enabled ? (
                  <span className="block pt-2 text-xs text-muted-foreground">
                    Create the first version before connecting a remote.
                  </span>
                ) : null}
                {remoteError ? (
                  <span
                    className="block pt-2 text-xs text-destructive"
                    role="alert"
                  >
                    {remoteError}
                  </span>
                ) : null}
              </>
            }
            controlClassName="flex items-center gap-2"
          >
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
              disabled={
                !enabled ||
                !status?.head ||
                !remoteUrl.trim() ||
                remoteUrl.trim() === savedRemoteUrl ||
                busy
              }
              onClick={() => void saveRemote()}
            >
              {operation === "configuring-remote" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <CloudCog className="h-4 w-4" />
              )}
              {remoteConfigured ? "Update" : "Connect"}
            </Button>
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>
    </div>
  )
}
