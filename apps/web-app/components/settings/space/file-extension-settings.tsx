import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderCog,
  LoaderCircle,
  Package,
  PauseCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

type FileExtensionDiscovery = Awaited<
  ReturnType<typeof window.eidos.fileExtensions.discover>
>
type FileExtensionPackage = FileExtensionDiscovery["packages"][number]
type FileExtensionGrant = FileExtensionPackage["requestedGrants"][number]

function snapshotFor(extension: FileExtensionPackage) {
  if (
    !extension.canonicalId ||
    !extension.contentDigest ||
    !extension.permissionHash
  ) {
    return null
  }
  return {
    packageId: extension.canonicalId,
    contentDigest: extension.contentDigest,
    permissionHash: extension.permissionHash,
  }
}

function grantKey(grant: FileExtensionGrant): string {
  return `${grant.kind}\0${grant.value}`
}

function contributionCount(extension: FileExtensionPackage): number {
  const contributes = extension.manifest?.contributes
  if (!contributes) return 0
  return (
    (contributes.commands?.length ?? 0) + (contributes.fileEditors?.length ?? 0)
  )
}

export function FileExtensionSettings() {
  const { t } = useTranslation()
  const { currentSpace } = useCurrentSpace()
  const spaceId = currentSpace?.id
  const [discovery, setDiscovery] = useState<FileExtensionDiscovery | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreator, setShowCreator] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdPath, setCreatedPath] = useState<string | null>(null)
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(
    () => new Set()
  )
  const [mutatingPackage, setMutatingPackage] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<{
    packageId: string
    message: string
  } | null>(null)
  const requestGeneration = useRef(0)
  const lastEventGeneration = useRef(0)

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current
    if (!spaceId || currentSpace?.mode !== "file") {
      setLoading(false)
      return
    }
    if (!isDesktopMode || !window.eidos?.fileExtensions?.discover) {
      setError(
        t(
          "space.settings.fileExtensions.desktopOnly",
          "Extension package inspection is available in the desktop app."
        )
      )
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const nextDiscovery = await window.eidos.fileExtensions.discover(spaceId)
      if (generation !== requestGeneration.current) return
      setDiscovery(nextDiscovery)
    } catch (loadError) {
      if (generation !== requestGeneration.current) return
      setError(
        loadError instanceof Error
          ? loadError.message
          : t(
              "space.settings.fileExtensions.loadFailed",
              "Unable to inspect extension packages."
            )
      )
    } finally {
      if (generation === requestGeneration.current) setLoading(false)
    }
  }, [currentSpace?.mode, spaceId, t])

  const createTemplate = useCallback(async () => {
    if (!spaceId || creating) return
    const name = templateName.trim()
    if (!name) return
    setCreating(true)
    setCreateError(null)
    setCreatedPath(null)
    try {
      const result = await window.eidos.fileExtensions.createTemplate(
        spaceId,
        name
      )
      setCreatedPath(result.root)
      setTemplateName("")
      setShowCreator(false)
      await load()
    } catch (createTemplateError) {
      setCreateError(
        createTemplateError instanceof Error
          ? createTemplateError.message
          : t(
              "space.settings.fileExtensions.createFailed",
              "Unable to create the extension template."
            )
      )
    } finally {
      setCreating(false)
    }
  }, [creating, load, spaceId, t, templateName])

  const mutatePackage = useCallback(
    async (extension: FileExtensionPackage, mutate: () => Promise<unknown>) => {
      const packageId = extension.canonicalId ?? extension.directoryName
      if (mutatingPackage) return
      setMutatingPackage(packageId)
      setMutationError(null)
      try {
        await mutate()
        await load()
      } catch (mutation) {
        setMutationError({
          packageId,
          message:
            mutation instanceof Error
              ? mutation.message
              : t(
                  "space.settings.fileExtensions.stateChangeFailed",
                  "Unable to update local extension state."
                ),
        })
      } finally {
        setMutatingPackage(null)
      }
    },
    [load, mutatingPackage, t]
  )

  useEffect(() => {
    setDiscovery(null)
    void load()
    return () => {
      requestGeneration.current += 1
    }
  }, [load])

  useEffect(() => {
    if (!spaceId || !isDesktopMode || !window.eidos?.fileExtensions) return
    lastEventGeneration.current = 0
    const listenerId = window.eidos.on(
      "file-extensions:changed",
      (_event: unknown, payload: unknown) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("spaceId" in payload) ||
          !("generation" in payload) ||
          payload.spaceId !== spaceId ||
          typeof payload.generation !== "number" ||
          payload.generation <= lastEventGeneration.current
        ) {
          return
        }
        lastEventGeneration.current = payload.generation
        void load()
      }
    )

    return () => {
      if (listenerId) window.eidos.off("file-extensions:changed", listenerId)
    }
  }, [load, spaceId])

  const counts = useMemo(() => {
    const result = {
      enabled: 0,
      disabled: 0,
      untrusted: 0,
      incompatible: 0,
      invalid: 0,
    }
    for (const extension of discovery?.packages ?? []) {
      result[extension.lifecycleStatus] += 1
    }
    return result
  }, [discovery])

  if (!spaceId || currentSpace?.mode !== "file") return null

  const statusLabel = (
    status: FileExtensionPackage["lifecycleStatus"]
  ): string => {
    switch (status) {
      case "untrusted":
        return t("space.settings.fileExtensions.untrusted", "Untrusted")
      case "disabled":
        return t("space.settings.fileExtensions.disabled", "Disabled")
      case "enabled":
        return t("space.settings.fileExtensions.enabled", "Enabled")
      case "incompatible":
        return t("space.settings.fileExtensions.incompatible", "Incompatible")
      case "invalid":
        return t("space.settings.fileExtensions.invalid", "Invalid")
    }
  }

  return (
    <div className="space-y-8" data-settings-row-groups="true">
      <section>
        <div className="flex items-center justify-between gap-4 pb-2">
          <h3>
            {t("space.settings.fileExtensions.packages", "Extension packages")}
          </h3>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={creating}
              onClick={() => {
                setCreateError(null)
                setCreatedPath(null)
                setShowCreator((visible) => !visible)
              }}
            >
              <Plus />
              {t("space.settings.fileExtensions.newExtension", "New extension")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              {t("space.settings.fileExtensions.refresh", "Refresh")}
            </Button>
          </div>
        </div>
        <hr />
        <div className="divide-y divide-border/70">
          {showCreator && (
            <div className="py-4">
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="local-extension-name">
                    {t(
                      "space.settings.fileExtensions.extensionId",
                      "Local extension ID"
                    )}
                  </Label>
                  <div className="flex items-center rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring">
                    <span className="pl-3 text-sm text-muted-foreground">
                      local.
                    </span>
                    <Input
                      id="local-extension-name"
                      value={templateName}
                      autoFocus
                      placeholder="task-counter"
                      className="border-0 pl-0 shadow-none focus-visible:ring-0"
                      disabled={creating}
                      onChange={(event) => {
                        setTemplateName(event.target.value)
                        setCreateError(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void createTemplate()
                        }
                        if (event.key === "Escape") {
                          setShowCreator(false)
                          setCreateError(null)
                        }
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "space.settings.fileExtensions.extensionIdDescription",
                      "Use lowercase letters, numbers, and hyphens. Eidos creates real source files that appear in Version changes."
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!templateName.trim() || creating}
                  onClick={() => void createTemplate()}
                >
                  {creating && <LoaderCircle className="animate-spin" />}
                  {t("space.settings.fileExtensions.create", "Create")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={creating}
                  onClick={() => {
                    setShowCreator(false)
                    setCreateError(null)
                  }}
                >
                  {t("space.settings.fileExtensions.cancel", "Cancel")}
                </Button>
              </div>
              {createError && (
                <p className="mt-2 text-sm text-destructive">{createError}</p>
              )}
            </div>
          )}
          <div className="flex min-h-[76px] items-center justify-between gap-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <FolderCog className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label>
                  {t(
                    "space.settings.fileExtensions.location",
                    "Package location"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileExtensions.locationDescription",
                    "Each direct child is one publisher.name package. Private Space paths stay hidden from normal file APIs."
                  )}
                </p>
              </div>
            </div>
            <code className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs">
              {discovery?.root ?? ".eidos/extensions"}
            </code>
          </div>
          <div className="flex min-h-[76px] items-center justify-between gap-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label>
                  {t(
                    "space.settings.fileExtensions.runtime",
                    "Runtime boundary"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileExtensions.runtimeDescription",
                    "Enabled packages run in an isolated Worker bound to exact source bytes. This preview exposes read-only text access and host-owned notices, confirmations, and selections."
                  )}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 font-normal">
              {t(
                "space.settings.fileExtensions.localStateOnly",
                "Developer preview"
              )}
            </Badge>
          </div>
        </div>
        {createdPath && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t(
              "space.settings.fileExtensions.created",
              "Created {{path}}. Edit these real files with your preferred editor; Version will show their changes.",
              { path: createdPath }
            )}
          </p>
        )}
      </section>

      <section>
        <div className="flex items-end justify-between gap-4 pb-2">
          <div>
            <h3>
              {t("space.settings.fileExtensions.detected", "Detected packages")}
            </h3>
            {discovery && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "space.settings.fileExtensions.hostVersion",
                  "Host {{version}} · {{enabled}} enabled · {{disabled}} disabled · {{untrusted}} untrusted · {{incompatible}} incompatible · {{invalid}} invalid",
                  {
                    version: discovery.hostVersion,
                    enabled: counts.enabled,
                    disabled: counts.disabled,
                    untrusted: counts.untrusted,
                    incompatible: counts.incompatible,
                    invalid: counts.invalid,
                  }
                )}
              </p>
            )}
          </div>
        </div>
        <hr />

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!error && loading && !discovery && (
          <div className="flex min-h-32 items-center justify-center text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!error && !loading && discovery?.packages.length === 0 && (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
            <Package className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium">
              {t(
                "space.settings.fileExtensions.empty",
                "No extension packages found"
              )}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t(
                "space.settings.fileExtensions.emptyDescription",
                "Place a package containing extension.json under .eidos/extensions/publisher.name, then refresh this page."
              )}
            </p>
          </div>
        )}

        {discovery && discovery.packages.length > 0 && (
          <div className="divide-y divide-border/70">
            {discovery.packages.map((extension) => {
              const displayName =
                extension.manifest?.displayName ?? extension.directoryName
              const diagnostics = extension.diagnostics
              const snapshot = snapshotFor(extension)
              const packageId = extension.canonicalId ?? extension.directoryName
              const expanded = expandedPackages.has(packageId)
              const manageable = extension.status === "ready" && !!snapshot
              const busy = mutatingPackage === packageId
              const trusted = extension.localState?.trusted === true
              const enabled = extension.localState?.enabled === true
              const granted = new Set(
                extension.localState?.granted.map(grantKey) ?? []
              )
              return (
                <div key={extension.directoryName} className="py-4">
                  <div className="flex min-h-[56px] items-start justify-between gap-6">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {extension.lifecycleStatus === "enabled" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      ) : extension.lifecycleStatus === "disabled" ? (
                        <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : extension.lifecycleStatus === "untrusted" ? (
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      ) : (
                        <AlertCircle
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            extension.lifecycleStatus === "invalid"
                              ? "text-destructive"
                              : "text-amber-600"
                          )}
                        />
                      )}
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Label>{displayName}</Label>
                          <span className="text-xs text-muted-foreground">
                            {extension.manifest
                              ? `v${extension.manifest.version}`
                              : extension.directoryName}
                          </span>
                        </div>
                        <p className="text-sm leading-5 text-muted-foreground">
                          {extension.manifest?.description ??
                            t(
                              "space.settings.fileExtensions.manifestUnavailable",
                              "The package manifest could not be read."
                            )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "space.settings.fileExtensions.packageSummary",
                            "{{files}} files · {{contributions}} contributions · {{permissions}} permissions",
                            {
                              files: extension.files.length,
                              contributions: contributionCount(extension),
                              permissions: extension.requestedGrants.length,
                            }
                          )}
                        </p>
                        {diagnostics.length > 0 && (
                          <ul className="space-y-1 pt-1 text-xs text-muted-foreground">
                            {diagnostics.map((diagnostic, index) => (
                              <li
                                key={`${diagnostic.code}-${diagnostic.path ?? diagnostic.pointer ?? index}`}
                                className={cn(
                                  diagnostic.severity === "error" &&
                                    "text-destructive"
                                )}
                              >
                                <code>{diagnostic.code}</code>:{" "}
                                {diagnostic.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal",
                          extension.lifecycleStatus === "enabled" &&
                            "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
                          extension.lifecycleStatus === "untrusted" &&
                            "border-amber-500/40 text-amber-700 dark:text-amber-400",
                          extension.lifecycleStatus === "incompatible" &&
                            "border-amber-500/40 text-amber-700 dark:text-amber-400",
                          extension.lifecycleStatus === "invalid" &&
                            "border-destructive/40 text-destructive"
                        )}
                      >
                        {statusLabel(extension.lifecycleStatus)}
                      </Badge>
                      {manageable && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setExpandedPackages((current) => {
                              const next = new Set(current)
                              if (next.has(packageId)) next.delete(packageId)
                              else next.add(packageId)
                              return next
                            })
                          }}
                        >
                          {expanded ? <ChevronDown /> : <ChevronRight />}
                          {trusted
                            ? t(
                                "space.settings.fileExtensions.manage",
                                "Manage"
                              )
                            : t(
                                "space.settings.fileExtensions.review",
                                "Review"
                              )}
                        </Button>
                      )}
                    </div>
                  </div>
                  {expanded && manageable && snapshot && (
                    <div className="ml-7 mt-4 border-l pl-4">
                      <div className="divide-y divide-border/70 rounded-md bg-muted/30 px-4">
                        <div className="flex min-h-[72px] items-center justify-between gap-6 py-3">
                          <div className="min-w-0">
                            <Label>
                              {t(
                                "space.settings.fileExtensions.sourceTrust",
                                "Source trust"
                              )}
                            </Label>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {trusted
                                ? t(
                                    "space.settings.fileExtensions.sourceTrustedDescription",
                                    "Approved only for this exact content and permission digest."
                                  )
                                : t(
                                    "space.settings.fileExtensions.sourceUntrustedDescription",
                                    "Review the source and requested permissions before trusting this snapshot."
                                  )}
                            </p>
                            <code
                              className="mt-1 block max-w-[34rem] truncate text-[11px] text-muted-foreground"
                              title={extension.contentDigest}
                            >
                              {extension.contentDigest}
                            </code>
                          </div>
                          {trusted ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              disabled={!!mutatingPackage}
                              onClick={() =>
                                void mutatePackage(extension, () =>
                                  window.eidos.fileExtensions.revokeTrust(
                                    spaceId,
                                    snapshot
                                  )
                                )
                              }
                            >
                              {busy && (
                                <LoaderCircle className="animate-spin" />
                              )}
                              {t(
                                "space.settings.fileExtensions.revokeTrust",
                                "Revoke trust"
                              )}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={!!mutatingPackage}
                              onClick={() =>
                                void mutatePackage(extension, () =>
                                  window.eidos.fileExtensions.trust(
                                    spaceId,
                                    snapshot
                                  )
                                )
                              }
                            >
                              {busy && (
                                <LoaderCircle className="animate-spin" />
                              )}
                              {t(
                                "space.settings.fileExtensions.trustSource",
                                "Trust source"
                              )}
                            </Button>
                          )}
                        </div>

                        <div className="flex min-h-[68px] items-center justify-between gap-6 py-3">
                          <div>
                            <Label>
                              {t(
                                "space.settings.fileExtensions.enablement",
                                "Enablement"
                              )}
                            </Label>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t(
                                "space.settings.fileExtensions.enablementDescription",
                                "Allows this exact trusted snapshot to run when a command is invoked."
                              )}
                            </p>
                          </div>
                          <Switch
                            aria-label={t(
                              "space.settings.fileExtensions.enablement",
                              "Enablement"
                            )}
                            checked={enabled}
                            disabled={!trusted || !!mutatingPackage}
                            onCheckedChange={(checked) =>
                              void mutatePackage(extension, () =>
                                window.eidos.fileExtensions.setEnabled(
                                  spaceId,
                                  snapshot,
                                  checked
                                )
                              )
                            }
                          />
                        </div>

                        <div className="py-3">
                          <Label>
                            {t(
                              "space.settings.fileExtensions.permissions",
                              "Permission grants"
                            )}
                          </Label>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t(
                              "space.settings.fileExtensions.permissionsDescription",
                              "Every capability is denied until you grant it on this device."
                            )}
                          </p>
                          {extension.requestedGrants.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">
                              {t(
                                "space.settings.fileExtensions.noPermissions",
                                "This extension requests no capabilities."
                              )}
                            </p>
                          ) : (
                            <div className="mt-2 divide-y divide-border/60">
                              {extension.requestedGrants.map((grant) => (
                                <div
                                  key={grantKey(grant)}
                                  className="flex min-h-11 items-center justify-between gap-4 py-2"
                                >
                                  <div className="min-w-0 text-sm">
                                    <span className="mr-2 text-muted-foreground">
                                      {grant.kind}
                                    </span>
                                    <code className="break-all text-xs">
                                      {grant.value}
                                    </code>
                                  </div>
                                  <Switch
                                    aria-label={`${grant.kind} ${grant.value}`}
                                    checked={granted.has(grantKey(grant))}
                                    disabled={!trusted || !!mutatingPackage}
                                    onCheckedChange={(checked) =>
                                      void mutatePackage(extension, () =>
                                        window.eidos.fileExtensions.setGrant(
                                          spaceId,
                                          {
                                            ...snapshot,
                                            grant,
                                            granted: checked,
                                          }
                                        )
                                      )
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {mutationError?.packageId === packageId && (
                        <p className="mt-2 text-sm text-destructive">
                          {mutationError.message}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {discovery && discovery.diagnostics.length > 0 && (
          <div className="mt-4 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
            {discovery.diagnostics.map((diagnostic, index) => (
              <p key={`${diagnostic.code}-${index}`}>
                <code>{diagnostic.code}</code>: {diagnostic.message}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
