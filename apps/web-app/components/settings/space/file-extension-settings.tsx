import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  FolderCog,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
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

type FileExtensionDiscovery = Awaited<
  ReturnType<typeof window.eidos.fileExtensions.discover>
>
type FileExtensionPackage = FileExtensionDiscovery["packages"][number]

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
      void window.eidos.fileExtensions.startWatching(spaceId).catch(() => {
        // A missing extension root remains valid and can be retried on Refresh.
      })
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
      void window.eidos.fileExtensions.stopWatching(spaceId).catch(() => {
        // Renderer teardown is best-effort; process teardown closes any remainder.
      })
    }
  }, [load, spaceId])

  const counts = useMemo(() => {
    const result = { valid: 0, incompatible: 0, invalid: 0 }
    for (const extension of discovery?.packages ?? []) {
      if (extension.status === "ready") result.valid += 1
      else result[extension.status] += 1
    }
    return result
  }, [discovery])

  if (!spaceId || currentSpace?.mode !== "file") return null

  const statusLabel = (status: FileExtensionPackage["status"]): string => {
    switch (status) {
      case "ready":
        return t("space.settings.fileExtensions.untrusted", "Untrusted")
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
                    "Eidos validates identity, compatibility, permissions, imports, and package bytes without executing extension code."
                  )}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 font-normal">
              {t(
                "space.settings.fileExtensions.inspectionOnly",
                "Inspection only"
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
                  "Host {{version}} · {{valid}} valid but untrusted · {{incompatible}} incompatible · {{invalid}} invalid",
                  {
                    version: discovery.hostVersion,
                    valid: counts.valid,
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
              return (
                <div
                  key={extension.directoryName}
                  className="flex min-h-[88px] items-start justify-between gap-6 py-4"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {extension.status === "ready" ? (
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    ) : (
                      <AlertCircle
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          extension.status === "invalid"
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
                          "{{files}} files · {{contributions}} contributions",
                          {
                            files: extension.files.length,
                            contributions: contributionCount(extension),
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
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 font-normal",
                      extension.status === "ready" &&
                        "border-amber-500/40 text-amber-700 dark:text-amber-400",
                      extension.status === "incompatible" &&
                        "border-amber-500/40 text-amber-700 dark:text-amber-400",
                      extension.status === "invalid" &&
                        "border-destructive/40 text-destructive"
                    )}
                  >
                    {statusLabel(extension.status)}
                  </Badge>
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
