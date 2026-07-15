import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Command as CommandIcon,
  Download,
  FilePenLine,
  FolderCog,
  Github,
  LoaderCircle,
  Package,
  PauseCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
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
type FileExtensionInstallPreview = Awaited<
  ReturnType<typeof window.eidos.fileExtensions.prepareGitHubInstall>
>
type LocalExtensionTemplateKind = "command" | "text-editor"
type CreatedLocalExtension = {
  canonicalId: string
  root: string
  template: LocalExtensionTemplateKind
}

const DEFAULT_TEXT_EDITOR_PATTERN = "**/*.notes.md"

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

function packageElementId(packageId: string): string {
  return `file-extension-package-${packageId.replace(/[^a-zA-Z0-9_-]/g, "-")}`
}

function fileEditorSelectorLabel(
  selector: NonNullable<
    NonNullable<FileExtensionPackage["manifest"]>["contributes"]["fileEditors"]
  >[number]["selector"][number]
): string {
  return [selector.filenamePattern, selector.mediaType]
    .filter((value): value is string => !!value)
    .join(" · ")
}

export function FileExtensionSettings() {
  const { t } = useTranslation()
  const { currentSpace } = useCurrentSpace()
  const setCmdkOpen = useAppRuntimeStore((state) => state.setCmdkOpen)
  const spaceId = currentSpace?.id
  const [discovery, setDiscovery] = useState<FileExtensionDiscovery | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreator, setShowCreator] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateKind, setTemplateKind] =
    useState<LocalExtensionTemplateKind>("command")
  const [templatePattern, setTemplatePattern] = useState(
    DEFAULT_TEXT_EDITOR_PATTERN
  )
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdExtension, setCreatedExtension] =
    useState<CreatedLocalExtension | null>(null)
  const [showInstaller, setShowInstaller] = useState(false)
  const [githubRepository, setGithubRepository] = useState("")
  const [githubRef, setGithubRef] = useState("")
  const [githubSubdirectory, setGithubSubdirectory] = useState("")
  const [installPreview, setInstallPreview] =
    useState<FileExtensionInstallPreview | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installedMessage, setInstalledMessage] = useState<string | null>(null)
  const [removeConfirmation, setRemoveConfirmation] = useState<string | null>(
    null
  )
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
  const installPreviewRef = useRef<FileExtensionInstallPreview | null>(null)
  const revealedCreatedPackage = useRef<string | null>(null)

  useEffect(() => {
    installPreviewRef.current = installPreview
  }, [installPreview])

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
    const filenamePattern = templatePattern.trim()
    if (!name || (templateKind === "text-editor" && !filenamePattern)) return
    setCreating(true)
    setCreateError(null)
    setCreatedExtension(null)
    try {
      const createdTemplate = templateKind
      const result = await window.eidos.fileExtensions.createTemplate(spaceId, {
        name,
        template: templateKind,
        filenamePattern:
          templateKind === "text-editor" ? filenamePattern : undefined,
        mediaType: templateKind === "text-editor" ? "text/markdown" : undefined,
      })
      revealedCreatedPackage.current = null
      setCreatedExtension({
        canonicalId: result.canonicalId,
        root: result.root,
        template: createdTemplate,
      })
      setTemplateName("")
      setTemplateKind("command")
      setTemplatePattern(DEFAULT_TEXT_EDITOR_PATTERN)
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
  }, [creating, load, spaceId, t, templateKind, templateName, templatePattern])

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

  const cancelInstallPreview = useCallback(async () => {
    const preview = installPreviewRef.current
    installPreviewRef.current = null
    setInstallPreview(null)
    if (!preview || !spaceId || !window.eidos?.fileExtensions) return
    await window.eidos.fileExtensions
      .cancelGitHubInstall(spaceId, preview.previewId)
      .catch(() => undefined)
  }, [spaceId])

  const prepareGitHubInstall = useCallback(async () => {
    if (!spaceId || installing || !githubRepository.trim()) return
    setInstalling(true)
    setInstallError(null)
    setInstalledMessage(null)
    await cancelInstallPreview()
    try {
      const preview = await window.eidos.fileExtensions.prepareGitHubInstall(
        spaceId,
        {
          repository: githubRepository.trim(),
          requested: githubRef.trim() || undefined,
          subdirectory: githubSubdirectory.trim() || undefined,
        }
      )
      installPreviewRef.current = preview
      setInstallPreview(preview)
    } catch (install) {
      setInstallError(
        install instanceof Error
          ? install.message
          : t(
              "space.settings.fileExtensions.prepareInstallFailed",
              "Unable to prepare this GitHub extension."
            )
      )
    } finally {
      setInstalling(false)
    }
  }, [
    cancelInstallPreview,
    githubRef,
    githubRepository,
    githubSubdirectory,
    installing,
    spaceId,
    t,
  ])

  const applyGitHubInstall = useCallback(async () => {
    if (!spaceId || !installPreview || installing) return
    setInstalling(true)
    setInstallError(null)
    try {
      const result = await window.eidos.fileExtensions.applyGitHubInstall(
        spaceId,
        {
          previewId: installPreview.previewId,
          contentDigest: installPreview.contentDigest,
          permissionHash: installPreview.permissionHash,
        }
      )
      installPreviewRef.current = null
      setInstallPreview(null)
      setInstalledMessage(
        result.operation === "install"
          ? t(
              "space.settings.fileExtensions.installed",
              "Installed {{id}}. Review permissions and trust this exact snapshot before enabling it.",
              { id: result.canonicalId }
            )
          : t(
              "space.settings.fileExtensions.updated",
              "Updated {{id}}. The new snapshot must be reviewed and trusted before it can run.",
              { id: result.canonicalId }
            )
      )
      setShowInstaller(false)
      await load()
    } catch (install) {
      installPreviewRef.current = null
      setInstallPreview(null)
      setInstallError(
        install instanceof Error
          ? install.message
          : t(
              "space.settings.fileExtensions.applyInstallFailed",
              "Unable to install this GitHub extension."
            )
      )
    } finally {
      setInstalling(false)
    }
  }, [installPreview, installing, load, spaceId, t])

  const preparePackageUpdate = useCallback(
    (extension: FileExtensionPackage) => {
      if (!extension.lock) return
      void cancelInstallPreview()
      setGithubRepository(extension.lock.source.repository)
      setGithubRef(extension.lock.source.requested)
      setGithubSubdirectory(extension.lock.source.subdirectory ?? "")
      setInstallError(null)
      setInstalledMessage(null)
      setShowInstaller(true)
      requestAnimationFrame(() => {
        document
          .getElementById("github-extension-installer")
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      })
    },
    [cancelInstallPreview]
  )

  useEffect(() => {
    setDiscovery(null)
    void load()
    return () => {
      requestGeneration.current += 1
    }
  }, [load])

  const revealPackage = useCallback((packageId: string) => {
    setExpandedPackages((current) => {
      if (current.has(packageId)) return current
      const next = new Set(current)
      next.add(packageId)
      return next
    })
    requestAnimationFrame(() => {
      document
        .getElementById(packageElementId(packageId))
        ?.scrollIntoView?.({ block: "center" })
    })
  }, [])

  useEffect(() => {
    const packageId = createdExtension?.canonicalId
    if (
      !packageId ||
      revealedCreatedPackage.current === packageId ||
      !discovery?.packages.some(
        (extension) => extension.canonicalId === packageId
      )
    ) {
      return
    }
    revealedCreatedPackage.current = packageId
    revealPackage(packageId)
  }, [createdExtension?.canonicalId, discovery, revealPackage])

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

  useEffect(() => {
    if (!spaceId || !isDesktopMode || !window.eidos?.fileExtensions) return
    const listenerId = window.eidos.on(
      "file-extensions:development-changed",
      (_event: unknown, payload: unknown) => {
        if (
          payload &&
          typeof payload === "object" &&
          "spaceId" in payload &&
          payload.spaceId === spaceId
        ) {
          void load()
        }
      }
    )
    return () => {
      if (listenerId) {
        window.eidos.off("file-extensions:development-changed", listenerId)
      }
    }
  }, [load, spaceId])

  useEffect(
    () => () => {
      const preview = installPreviewRef.current
      if (preview && spaceId && window.eidos?.fileExtensions) {
        void window.eidos.fileExtensions
          .cancelGitHubInstall(spaceId, preview.previewId)
          .catch(() => undefined)
      }
    },
    [spaceId]
  )

  const counts = useMemo(() => {
    const result = {
      development: 0,
      enabled: 0,
      disabled: 0,
      untrusted: 0,
      incompatible: 0,
      invalid: 0,
    }
    for (const extension of discovery?.packages ?? []) {
      if (extension.developmentSession) result.development += 1
      else result[extension.lifecycleStatus] += 1
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

  const developmentStatusLabel = (
    status: NonNullable<FileExtensionPackage["developmentSession"]>["status"]
  ): string => {
    switch (status) {
      case "checking":
        return t("space.settings.fileExtensions.devChecking", "Checking")
      case "ready":
        return t("space.settings.fileExtensions.devReady", "Development")
      case "invalid":
        return t("space.settings.fileExtensions.devInvalid", "Fix required")
      case "permissions-changed":
        return t(
          "space.settings.fileExtensions.devPermissionsChanged",
          "Review permissions"
        )
      case "missing":
        return t("space.settings.fileExtensions.devMissing", "Source missing")
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
              disabled={installing}
              onClick={() => {
                if (showInstaller) {
                  void cancelInstallPreview()
                  setInstallError(null)
                }
                setInstalledMessage(null)
                setShowInstaller((visible) => !visible)
              }}
            >
              <Github />
              {t(
                "space.settings.fileExtensions.installFromGitHub",
                "Install from GitHub"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={creating}
              onClick={() => {
                setCreateError(null)
                setCreatedExtension(null)
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
          {showInstaller && (
            <div id="github-extension-installer" className="py-4">
              <div className="space-y-4 rounded-md bg-muted/30 p-4">
                <div>
                  <Label>
                    {t(
                      "space.settings.fileExtensions.githubSource",
                      "GitHub source"
                    )}
                  </Label>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {t(
                      "space.settings.fileExtensions.githubSourceDescription",
                      "Public repositories only in this preview. Eidos resolves the ref to an immutable commit, validates the complete source, and never runs install scripts."
                    )}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_14rem_minmax(14rem,0.7fr)_auto] xl:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="github-extension-repository">
                      {t(
                        "space.settings.fileExtensions.repository",
                        "Repository"
                      )}
                    </Label>
                    <Input
                      id="github-extension-repository"
                      value={githubRepository}
                      placeholder="https://github.com/example/task-counter"
                      disabled={installing}
                      onChange={(event) => {
                        setGithubRepository(event.target.value)
                        setInstallError(null)
                        void cancelInstallPreview()
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="github-extension-ref">
                      {t(
                        "space.settings.fileExtensions.requestedRef",
                        "Branch, tag, or commit"
                      )}
                    </Label>
                    <Input
                      id="github-extension-ref"
                      value={githubRef}
                      placeholder="HEAD"
                      disabled={installing}
                      onChange={(event) => {
                        setGithubRef(event.target.value)
                        setInstallError(null)
                        void cancelInstallPreview()
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void prepareGitHubInstall()
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="github-extension-subdirectory">
                      {t(
                        "space.settings.fileExtensions.packagePath",
                        "Package path"
                      )}
                    </Label>
                    <Input
                      id="github-extension-subdirectory"
                      value={githubSubdirectory}
                      placeholder="packages/my-extension"
                      disabled={installing}
                      onChange={(event) => {
                        setGithubSubdirectory(event.target.value)
                        setInstallError(null)
                        void cancelInstallPreview()
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void prepareGitHubInstall()
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!githubRepository.trim() || installing}
                    onClick={() => void prepareGitHubInstall()}
                  >
                    {installing ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Download />
                    )}
                    {t(
                      "space.settings.fileExtensions.prepareReview",
                      "Prepare review"
                    )}
                  </Button>
                </div>

                {installError && (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{installError}</span>
                  </div>
                )}

                {installPreview && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Label>{installPreview.displayName}</Label>
                          <Badge variant="outline" className="font-normal">
                            v{installPreview.version}
                          </Badge>
                          <Badge variant="outline" className="font-normal">
                            {installPreview.operation === "install"
                              ? t(
                                  "space.settings.fileExtensions.newInstall",
                                  "New install"
                                )
                              : t(
                                  "space.settings.fileExtensions.updateInstall",
                                  "Update"
                                )}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {installPreview.canonicalId}
                          {installPreview.source.subdirectory && (
                            <span className="ml-2 text-muted-foreground">
                              · {installPreview.source.subdirectory}
                            </span>
                          )}
                        </p>
                      </div>
                      <code
                        className="rounded bg-background px-2 py-1 text-xs text-muted-foreground"
                        title={installPreview.source.commit}
                      >
                        {installPreview.source.commit.slice(0, 12)}
                      </code>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t(
                            "space.settings.fileExtensions.permissionChanges",
                            "Permission changes"
                          )}
                        </p>
                        {installPreview.permissionChanges.length === 0 ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {t(
                              "space.settings.fileExtensions.noPermissionChanges",
                              "No permission changes."
                            )}
                          </p>
                        ) : (
                          <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                            {installPreview.permissionChanges.map((change) => (
                              <li
                                key={`${change.change}-${change.kind}-${change.value}`}
                                className={cn(
                                  "break-all",
                                  change.change === "added"
                                    ? "text-amber-700 dark:text-amber-400"
                                    : "text-muted-foreground"
                                )}
                              >
                                {change.change === "added" ? "+" : "−"}{" "}
                                {change.kind} <code>{change.value}</code>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t(
                            "space.settings.fileExtensions.sourceChanges",
                            "Source changes"
                          )}{" "}
                          · {installPreview.fileChanges.length}
                        </p>
                        {installPreview.fileChanges.length === 0 ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {t(
                              "space.settings.fileExtensions.upToDate",
                              "Already at this exact snapshot."
                            )}
                          </p>
                        ) : (
                          <ul className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-xs">
                            {installPreview.fileChanges.map((change) => (
                              <li key={`${change.kind}-${change.path}`}>
                                <span
                                  className={cn(
                                    "mr-2 inline-block w-4",
                                    change.kind === "added" &&
                                      "text-emerald-600",
                                    change.kind === "modified" &&
                                      "text-amber-600",
                                    change.kind === "removed" &&
                                      "text-destructive"
                                  )}
                                >
                                  {change.kind === "added"
                                    ? "A"
                                    : change.kind === "modified"
                                      ? "M"
                                      : "D"}
                                </span>
                                {change.path}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                      <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
                        {t(
                          "space.settings.fileExtensions.installTrustNotice",
                          "Installation only vendors reviewed source. The package remains disabled and untrusted until you separately approve its exact digest and grants."
                        )}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={installing}
                          onClick={() => void cancelInstallPreview()}
                        >
                          {t("space.settings.fileExtensions.cancel", "Cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            installing ||
                            installPreview.fileChanges.length === 0
                          }
                          onClick={() => void applyGitHubInstall()}
                        >
                          {installing && (
                            <LoaderCircle className="animate-spin" />
                          )}
                          {installPreview.operation === "install"
                            ? t(
                                "space.settings.fileExtensions.installReviewed",
                                "Install reviewed source"
                              )
                            : t(
                                "space.settings.fileExtensions.applyUpdate",
                                "Apply reviewed update"
                              )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {showCreator && (
            <div className="space-y-4 py-4">
              <fieldset className="space-y-2" disabled={creating}>
                <legend className="text-sm font-medium">
                  {t("space.settings.fileExtensions.templateType", "Starter")}
                </legend>
                <div
                  aria-describedby="local-extension-template-description"
                  className="inline-flex rounded-md bg-muted p-0.5"
                >
                  <label
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-[5px] px-3 text-sm transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
                      creating
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer",
                      templateKind === "command"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <input
                      type="radio"
                      name="local-extension-template"
                      value="command"
                      className="sr-only"
                      checked={templateKind === "command"}
                      onChange={() => {
                        setTemplateKind("command")
                        setCreateError(null)
                      }}
                    />
                    <Code2 className="h-4 w-4" />
                    {t(
                      "space.settings.fileExtensions.commandTemplate",
                      "Command"
                    )}
                  </label>
                  <label
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-[5px] px-3 text-sm transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
                      creating
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer",
                      templateKind === "text-editor"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <input
                      type="radio"
                      name="local-extension-template"
                      value="text-editor"
                      className="sr-only"
                      checked={templateKind === "text-editor"}
                      onChange={() => {
                        setTemplateKind("text-editor")
                        setCreateError(null)
                      }}
                    />
                    <FilePenLine className="h-4 w-4" />
                    {t(
                      "space.settings.fileExtensions.textEditorTemplate",
                      "Text editor"
                    )}
                  </label>
                </div>
                <p
                  id="local-extension-template-description"
                  className="text-xs text-muted-foreground"
                >
                  {templateKind === "command"
                    ? t(
                        "space.settings.fileExtensions.commandTemplateDescription",
                        "Adds an action to the command palette and contextual menus."
                      )
                    : t(
                        "space.settings.fileExtensions.textEditorTemplateDescription",
                        "Adds a sandboxed editor for matching text files."
                      )}
                </p>
              </fieldset>

              <div
                className={cn(
                  "grid gap-3 sm:items-end",
                  templateKind === "text-editor"
                    ? "sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto]"
                    : "sm:grid-cols-[minmax(12rem,1fr)_auto]"
                )}
              >
                <div className="min-w-0 space-y-1.5">
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
                          setTemplateName("")
                          setTemplateKind("command")
                          setTemplatePattern(DEFAULT_TEXT_EDITOR_PATTERN)
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

                {templateKind === "text-editor" && (
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="local-extension-pattern">
                      {t(
                        "space.settings.fileExtensions.filePattern",
                        "File pattern"
                      )}
                    </Label>
                    <Input
                      id="local-extension-pattern"
                      value={templatePattern}
                      spellCheck={false}
                      placeholder="**/*.notes.md"
                      disabled={creating}
                      onChange={(event) => {
                        setTemplatePattern(event.target.value)
                        setCreateError(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void createTemplate()
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "space.settings.fileExtensions.filePatternDescription",
                        "Only matching text files can be opened and edited."
                      )}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      !templateName.trim() ||
                      (templateKind === "text-editor" &&
                        !templatePattern.trim()) ||
                      creating
                    }
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
                      setTemplateName("")
                      setTemplateKind("command")
                      setTemplatePattern(DEFAULT_TEXT_EDITOR_PATTERN)
                      setCreateError(null)
                    }}
                  >
                    {t("space.settings.fileExtensions.cancel", "Cancel")}
                  </Button>
                </div>
              </div>
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
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
        {createdExtension && (
          <div
            role="status"
            className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <div className="flex min-w-0 items-start gap-2 text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p>
                  {t(
                    "space.settings.fileExtensions.created",
                    "Created {{path}}.",
                    { path: createdExtension.root }
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-5">
                  {createdExtension.template === "command"
                    ? t(
                        "space.settings.fileExtensions.commandCreatedNextStep",
                        "Next: review and enable it below, then run its command from the Command Palette."
                      )
                    : t(
                        "space.settings.fileExtensions.editorCreatedNextStep",
                        "Next: review its source, grant matching file access, and enable it below. Then open a matching file with the contributed editor."
                      )}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => revealPackage(createdExtension.canonicalId)}
            >
              {t(
                "space.settings.fileExtensions.reviewCreatedExtension",
                "Review extension"
              )}
              <ChevronRight />
            </Button>
          </div>
        )}
        {installedMessage && (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
            {installedMessage}
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
                  "Host {{version}} · {{development}} developing · {{enabled}} enabled · {{disabled}} disabled · {{untrusted}} untrusted · {{incompatible}} incompatible · {{invalid}} invalid",
                  {
                    version: discovery.hostVersion,
                    development: counts.development,
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
              const uninstallRequest = {
                directoryName: extension.directoryName,
                canonicalId: extension.canonicalId,
                contentDigest: extension.contentDigest,
              }
              const expanded = expandedPackages.has(packageId)
              const manageable = extension.status === "ready" && !!snapshot
              const development = extension.developmentSession
              const canManage = manageable || !!development
              const busy = mutatingPackage === packageId
              const trusted = extension.localState?.trusted === true
              const enabled = extension.localState?.enabled === true
              const granted = new Set(
                (
                  development?.granted ??
                  extension.localState?.granted ??
                  []
                ).map(grantKey)
              )
              const missingGrants = extension.requestedGrants.filter(
                (grant) => !granted.has(grantKey(grant))
              )
              const missingReadGrant = missingGrants.some(
                (grant) => grant.kind === "files.read"
              )
              const commands = extension.manifest?.contributes.commands ?? []
              const fileEditors =
                extension.manifest?.contributes.fileEditors ?? []
              const executionEnabled =
                extension.lifecycleStatus === "enabled" ||
                development?.status === "ready"
              return (
                <div
                  id={packageElementId(packageId)}
                  key={extension.directoryName}
                  className="scroll-m-8 py-4"
                >
                  <div className="flex min-h-[56px] items-start justify-between gap-6">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {development ? (
                        <Code2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                      ) : extension.lifecycleStatus === "enabled" ? (
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
                        {commands[0] && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CommandIcon className="h-3 w-3" />
                            <span className="truncate">
                              {commands[0].title}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {t(
                                "space.settings.fileExtensions.commandPaletteShortcut",
                                "Command Palette ⌘K"
                              )}
                            </span>
                          </p>
                        )}
                        {fileEditors[0] && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <FilePenLine className="h-3 w-3" />
                            <span className="truncate">
                              {fileEditors[0].displayName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {fileEditors[0].priority === "option"
                                ? t(
                                    "space.settings.fileExtensions.openWithTrigger",
                                    "Open with"
                                  )
                                : t(
                                    "space.settings.fileExtensions.opensAutomatically",
                                    "Opens automatically"
                                  )}
                            </span>
                          </p>
                        )}
                        {extension.lock && (
                          <p className="text-xs text-muted-foreground">
                            <Github className="mr-1 inline h-3 w-3" />
                            {extension.lock.source.repository.replace(
                              "https://github.com/",
                              ""
                            )}{" "}
                            · {extension.lock.source.commit.slice(0, 8)}
                            {extension.locallyModified && (
                              <span className="ml-2 text-amber-700 dark:text-amber-400">
                                {t(
                                  "space.settings.fileExtensions.locallyModified",
                                  "Locally modified"
                                )}
                              </span>
                            )}
                          </p>
                        )}
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
                          development &&
                            "border-sky-500/40 text-sky-700 dark:text-sky-400",
                          !development &&
                            extension.lifecycleStatus === "enabled" &&
                            "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
                          !development &&
                            extension.lifecycleStatus === "untrusted" &&
                            "border-amber-500/40 text-amber-700 dark:text-amber-400",
                          !development &&
                            extension.lifecycleStatus === "incompatible" &&
                            "border-amber-500/40 text-amber-700 dark:text-amber-400",
                          !development &&
                            extension.lifecycleStatus === "invalid" &&
                            "border-destructive/40 text-destructive"
                        )}
                      >
                        {development
                          ? developmentStatusLabel(development.status)
                          : statusLabel(extension.lifecycleStatus)}
                      </Badge>
                      {canManage && (
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
                          {trusted || development
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
                      {!canManage && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={!!mutatingPackage}
                          onClick={() => setRemoveConfirmation(packageId)}
                        >
                          <Trash2 />
                          {t(
                            "space.settings.fileExtensions.removeInvalid",
                            "Remove"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  {!canManage && removeConfirmation === packageId && (
                    <div className="ml-7 mt-3 flex flex-wrap items-center justify-between gap-4 rounded-md bg-destructive/5 px-3 py-2">
                      <p className="max-w-xl text-xs leading-5 text-destructive">
                        {t(
                          "space.settings.fileExtensions.removeInvalidConfirmation",
                          "Remove this invalid package source from the Space? Version will record the deletion; no extension code will run."
                        )}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={!!mutatingPackage}
                          onClick={() => setRemoveConfirmation(null)}
                        >
                          {t("space.settings.fileExtensions.cancel", "Cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={!!mutatingPackage}
                          onClick={() =>
                            void mutatePackage(extension, async () => {
                              await window.eidos.fileExtensions.uninstall(
                                spaceId,
                                uninstallRequest
                              )
                              setRemoveConfirmation(null)
                            })
                          }
                        >
                          {busy ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                          {t(
                            "space.settings.fileExtensions.removeSource",
                            "Remove source"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                  {expanded && development && (
                    <div className="ml-7 mt-4 border-l pl-4">
                      <div className="rounded-md bg-sky-500/5 px-4">
                        <div className="flex min-h-[76px] items-center justify-between gap-6 py-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Label>
                                {t(
                                  "space.settings.fileExtensions.developmentSession",
                                  "Development session"
                                )}
                              </Label>
                              <Badge
                                variant="outline"
                                className="border-sky-500/40 font-normal text-sky-700 dark:text-sky-400"
                              >
                                {developmentStatusLabel(development.status)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {t(
                                "space.settings.fileExtensions.developmentSessionDescription",
                                "Source-only changes reload automatically. The permission set and grants remain frozen to the trusted anchor snapshot."
                              )}
                            </p>
                            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                              {t(
                                "space.settings.fileExtensions.developmentDigest",
                                "Anchor {{anchor}} · Current {{current}}",
                                {
                                  anchor:
                                    development.anchorSnapshot.contentDigest.slice(
                                      7,
                                      19
                                    ),
                                  current:
                                    development.currentSnapshot?.contentDigest.slice(
                                      7,
                                      19
                                    ) ?? "—",
                                }
                              )}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!!mutatingPackage}
                            onClick={() =>
                              void mutatePackage(extension, () =>
                                window.eidos.fileExtensions.stopDevelopmentSession(
                                  spaceId,
                                  {
                                    packageId: development.packageId,
                                    sessionId: development.sessionId,
                                  }
                                )
                              )
                            }
                          >
                            {busy && <LoaderCircle className="animate-spin" />}
                            {t(
                              "space.settings.fileExtensions.stopDevelopment",
                              "Stop development"
                            )}
                          </Button>
                        </div>
                        {development.diagnostics.length > 0 && (
                          <div className="border-t border-sky-500/20 py-3 text-xs text-destructive">
                            {development.diagnostics.map(
                              (diagnostic, index) => (
                                <p key={`${diagnostic.code}-${index}`}>
                                  <code>{diagnostic.code}</code>:{" "}
                                  {diagnostic.message}
                                </p>
                              )
                            )}
                          </div>
                        )}
                      </div>
                      {mutationError?.packageId === packageId && (
                        <p className="mt-2 text-sm text-destructive">
                          {mutationError.message}
                        </p>
                      )}
                    </div>
                  )}
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
                              disabled={!!mutatingPackage || !!development}
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
                              disabled={!!mutatingPackage || !!development}
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
                                "Allows this exact trusted snapshot to run when one of its contributions is used."
                              )}
                            </p>
                          </div>
                          <Switch
                            aria-label={t(
                              "space.settings.fileExtensions.enablement",
                              "Enablement"
                            )}
                            checked={enabled}
                            disabled={
                              !trusted || !!mutatingPackage || !!development
                            }
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

                        {(commands.length > 0 || fileEditors.length > 0) && (
                          <div className="py-3">
                            <Label>
                              {t(
                                "space.settings.fileExtensions.howToUse",
                                "How to use"
                              )}
                            </Label>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {!executionEnabled
                                ? t(
                                    "space.settings.fileExtensions.contributionsNotReady",
                                    "Trust and enable this snapshot before using its contributions."
                                  )
                                : missingGrants.length > 0
                                  ? t(
                                      "space.settings.fileExtensions.contributionsMissingGrants",
                                      "Enabled, but some requested capabilities are still denied ({{count}}). Grant them below before relying on this extension.",
                                      { count: missingGrants.length }
                                    )
                                  : t(
                                      "space.settings.fileExtensions.contributionsReady",
                                      "This snapshot is ready. Use any contribution below to activate it."
                                    )}
                            </p>
                            <div className="mt-2 divide-y divide-border/60">
                              {commands.map((command) => (
                                <div
                                  key={command.id}
                                  className="flex min-h-[52px] items-center justify-between gap-4 py-2"
                                >
                                  <div className="flex min-w-0 items-start gap-2">
                                    <CommandIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">
                                        {command.title}
                                      </p>
                                      <code className="block truncate text-[11px] text-muted-foreground">
                                        {command.id}
                                      </code>
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={!executionEnabled}
                                    onClick={() => setCmdkOpen(true)}
                                  >
                                    <CommandIcon />
                                    {t(
                                      "space.settings.fileExtensions.openCommandPalette",
                                      "Open Command Palette"
                                    )}
                                    <kbd className="ml-1 text-[10px] text-muted-foreground">
                                      ⌘K
                                    </kbd>
                                  </Button>
                                </div>
                              ))}
                              {fileEditors.map((editor) => (
                                <div
                                  key={editor.id}
                                  className="flex min-h-[56px] items-center justify-between gap-4 py-2"
                                >
                                  <div className="flex min-w-0 items-start gap-2">
                                    <FilePenLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">
                                        {editor.displayName}
                                      </p>
                                      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1">
                                        {editor.selector.map(
                                          (selector, index) => (
                                            <code
                                              key={`${editor.id}-selector-${index}`}
                                              className="text-[11px] text-muted-foreground"
                                            >
                                              {fileEditorSelectorLabel(
                                                selector
                                              )}
                                            </code>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <p
                                    className={cn(
                                      "max-w-64 text-right text-xs leading-5",
                                      executionEnabled && !missingReadGrant
                                        ? "text-foreground"
                                        : "text-muted-foreground"
                                    )}
                                  >
                                    {!executionEnabled && (
                                      <>
                                        {t(
                                          "space.settings.fileExtensions.editorNotEnabledInstructions",
                                          "Trust and enable this extension first."
                                        )}{" "}
                                      </>
                                    )}
                                    {executionEnabled && missingReadGrant && (
                                      <>
                                        {t(
                                          "space.settings.fileExtensions.editorMissingReadGrantInstructions",
                                          "Grant matching files.read access below."
                                        )}{" "}
                                      </>
                                    )}
                                    {editor.priority === "option"
                                      ? t(
                                          "space.settings.fileExtensions.openEditorInstructions",
                                          "Right-click a matching file → Open with → {{name}}",
                                          { name: editor.displayName }
                                        )
                                      : t(
                                          "space.settings.fileExtensions.defaultEditorInstructions",
                                          "Open a matching file to use {{name}}",
                                          { name: editor.displayName }
                                        )}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {!development && trusted && enabled && (
                          <div className="flex min-h-[72px] items-center justify-between gap-6 py-3">
                            <div>
                              <Label>
                                {t(
                                  "space.settings.fileExtensions.developmentSession",
                                  "Development session"
                                )}
                              </Label>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {t(
                                  "space.settings.fileExtensions.startDevelopmentDescription",
                                  "Temporarily allow source-only edits to reload without persisting trust for each new digest. Permission changes remain blocked."
                                )}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!!mutatingPackage}
                              onClick={() =>
                                void mutatePackage(extension, () =>
                                  window.eidos.fileExtensions.startDevelopmentSession(
                                    spaceId,
                                    snapshot
                                  )
                                )
                              }
                            >
                              {busy ? (
                                <LoaderCircle className="animate-spin" />
                              ) : (
                                <Code2 />
                              )}
                              {t(
                                "space.settings.fileExtensions.startDevelopment",
                                "Start development"
                              )}
                            </Button>
                          </div>
                        )}

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
                                    disabled={
                                      !trusted ||
                                      !!mutatingPackage ||
                                      !!development
                                    }
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
                        {extension.lock && (
                          <div className="flex min-h-[68px] items-center justify-between gap-6 py-3">
                            <div>
                              <Label>
                                {t(
                                  "space.settings.fileExtensions.githubUpdate",
                                  "GitHub update"
                                )}
                              </Label>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {extension.locallyModified
                                  ? t(
                                      "space.settings.fileExtensions.updateBlockedByLocalChanges",
                                      "Local source differs from the installed baseline. Eidos will not overwrite it."
                                    )
                                  : t(
                                      "space.settings.fileExtensions.updateDescription",
                                      "Resolve the recorded branch, tag, or commit again and review every change before applying it."
                                    )}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                !!mutatingPackage ||
                                !!development ||
                                extension.locallyModified
                              }
                              onClick={() => preparePackageUpdate(extension)}
                            >
                              <Github />
                              {t(
                                "space.settings.fileExtensions.checkUpdate",
                                "Check update"
                              )}
                            </Button>
                          </div>
                        )}
                        <div className="py-3">
                          {removeConfirmation === packageId ? (
                            <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-destructive/5 px-3 py-2">
                              <p className="max-w-xl text-xs leading-5 text-destructive">
                                {t(
                                  "space.settings.fileExtensions.removeConfirmation",
                                  "Remove this package source from the Space? Version will record the deletion; local trust state is retained for recovery."
                                )}
                              </p>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={!!mutatingPackage || !!development}
                                  onClick={() => setRemoveConfirmation(null)}
                                >
                                  {t(
                                    "space.settings.fileExtensions.cancel",
                                    "Cancel"
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  disabled={!!mutatingPackage || !!development}
                                  onClick={() =>
                                    void mutatePackage(extension, async () => {
                                      await window.eidos.fileExtensions.uninstall(
                                        spaceId,
                                        uninstallRequest
                                      )
                                      setRemoveConfirmation(null)
                                    })
                                  }
                                >
                                  {busy ? (
                                    <LoaderCircle className="animate-spin" />
                                  ) : (
                                    <Trash2 />
                                  )}
                                  {t(
                                    "space.settings.fileExtensions.removeSource",
                                    "Remove source"
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              disabled={!!mutatingPackage || !!development}
                              onClick={() => setRemoveConfirmation(packageId)}
                            >
                              <Trash2 />
                              {t(
                                "space.settings.fileExtensions.uninstall",
                                "Uninstall extension"
                              )}
                            </Button>
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
