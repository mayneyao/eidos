import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Command as CommandIcon,
  Download,
  FileCode2,
  FilePenLine,
  FilePlus2,
  FolderCog,
  Github,
  LoaderCircle,
  LayoutGrid,
  Package,
  PauseCircle,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SquareTerminal,
  Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { useCMDKStore } from "@/components/cmdk/store"
import {
  toSpaceFileEditorUrl,
  toSpaceFileUrl,
  uniqueSpaceEntryName,
} from "@/components/file-space/file-path"
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
type FileExtensionRuntimeOutput = FileExtensionPackage["runtimeOutput"][number]
type FileExtensionDevelopmentSession = NonNullable<
  FileExtensionPackage["developmentSession"]
>
type FileExtensionDevelopmentChangedPayload = {
  spaceId: string
  packageId: string
  sessionId: string
  status: FileExtensionDevelopmentSession["status"] | "stopped"
  generation: number
  diagnostics: FileExtensionDevelopmentSession["diagnostics"]
  session?: FileExtensionDevelopmentSession
}
type FileExtensionCommand = NonNullable<
  NonNullable<FileExtensionPackage["manifest"]>["contributes"]["commands"]
>[number]
type FileExtensionPanel = NonNullable<
  NonNullable<FileExtensionPackage["manifest"]>["contributes"]["panels"]
>[number]
type FileExtensionBaseView = NonNullable<
  NonNullable<FileExtensionPackage["manifest"]>["contributes"]["baseViews"]
>[number]
type FileExtensionInstallPreview = Awaited<
  ReturnType<typeof window.eidos.fileExtensions.prepareGitHubInstall>
>
type FileExtensionLocalState = Awaited<
  ReturnType<typeof window.eidos.fileExtensions.setEnabled>
>
type LocalExtensionTemplateKind =
  | "command"
  | "panel"
  | "text-editor"
  | "base-view"
type ExtensionSourceKind = "manifest" | "worker" | "ui" | "source"
type ExtensionSourceFile = {
  kind: ExtensionSourceKind
  path: string
  relativePath: string
}
type CreatedLocalExtension = {
  canonicalId: string
  root: string
  sourcePath: string
  sourceKind: "worker" | "ui"
  template: LocalExtensionTemplateKind
}
type CommandRunState = {
  key: string
  status: "running" | "success" | "error"
  message?: string
}
type PanelOpenState = {
  key: string
  status: "opening" | "success" | "error"
  message?: string
}
type EditorSampleState = {
  key: string
  status: "creating" | "error"
  message?: string
}
type BaseSampleState = EditorSampleState

const DEFAULT_TEXT_EDITOR_PATTERN = "**/*.notes.md"
const MAX_RUNTIME_OUTPUT_ENTRIES = 100

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

function isFileExtensionLocalState(
  value: unknown
): value is FileExtensionLocalState {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<FileExtensionLocalState>
  return (
    !!candidate.snapshot &&
    typeof candidate.snapshot.packageId === "string" &&
    typeof candidate.snapshot.contentDigest === "string" &&
    typeof candidate.snapshot.permissionHash === "string" &&
    typeof candidate.trusted === "boolean" &&
    typeof candidate.enabled === "boolean" &&
    Array.isArray(candidate.requestedGrants) &&
    Array.isArray(candidate.granted)
  )
}

function parseDevelopmentChangedPayload(
  value: unknown
): FileExtensionDevelopmentChangedPayload | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<FileExtensionDevelopmentChangedPayload>
  if (
    typeof candidate.spaceId !== "string" ||
    typeof candidate.packageId !== "string" ||
    typeof candidate.sessionId !== "string" ||
    typeof candidate.generation !== "number" ||
    !Number.isSafeInteger(candidate.generation) ||
    candidate.generation < 1 ||
    ![
      "checking",
      "ready",
      "invalid",
      "permissions-changed",
      "missing",
      "stopped",
    ].includes(String(candidate.status)) ||
    !Array.isArray(candidate.diagnostics)
  ) {
    return null
  }
  if (candidate.status === "stopped") {
    return candidate as FileExtensionDevelopmentChangedPayload
  }
  const session = candidate.session
  const currentSnapshot = session?.currentSnapshot
  if (
    !session ||
    typeof session !== "object" ||
    session.sessionId !== candidate.sessionId ||
    session.packageId !== candidate.packageId ||
    session.status !== candidate.status ||
    session.generation !== candidate.generation ||
    !Array.isArray(session.diagnostics) ||
    !Array.isArray(session.granted) ||
    typeof session.startedAt !== "number" ||
    !session.anchorSnapshot ||
    session.anchorSnapshot.packageId !== candidate.packageId ||
    typeof session.anchorSnapshot.packageId !== "string" ||
    typeof session.anchorSnapshot.contentDigest !== "string" ||
    typeof session.anchorSnapshot.permissionHash !== "string" ||
    (currentSnapshot !== undefined &&
      (currentSnapshot.packageId !== candidate.packageId ||
        typeof currentSnapshot.contentDigest !== "string" ||
        typeof currentSnapshot.permissionHash !== "string"))
  ) {
    return null
  }
  return candidate as FileExtensionDevelopmentChangedPayload
}

function commandRunKey(
  extension: FileExtensionPackage,
  commandId: string
): string | null {
  const snapshot = snapshotFor(extension)
  return snapshot
    ? `${snapshot.packageId}\0${snapshot.contentDigest}\0${snapshot.permissionHash}\0${commandId}`
    : null
}

function panelOpenKey(
  extension: FileExtensionPackage,
  panelId: string
): string | null {
  const snapshot = snapshotFor(extension)
  return snapshot
    ? `${snapshot.packageId}\0${snapshot.contentDigest}\0${snapshot.permissionHash}\0${panelId}`
    : null
}

function latestRuntimeIssue(
  output: readonly FileExtensionRuntimeOutput[]
): FileExtensionRuntimeOutput | null {
  for (let index = output.length - 1; index >= 0; index -= 1) {
    const entry = output[index]
    if (entry && (entry.level === "error" || entry.level === "warn")) {
      return entry
    }
  }
  return null
}

function contributionCount(extension: FileExtensionPackage): number {
  const contributes = extension.manifest?.contributes
  if (!contributes) return 0
  return (
    (contributes.commands?.length ?? 0) +
    (contributes.panels?.length ?? 0) +
    (contributes.fileEditors?.length ?? 0) +
    (contributes.baseViews?.length ?? 0)
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

function sampleFilePartsForPattern(
  filenamePattern: string | undefined
): { stem: string; extension: string } | null {
  const normalized = filenamePattern?.trim().replace(/^\.\//, "")
  if (!normalized) return null
  const segments = normalized.split("/").filter(Boolean)
  const basename = segments.pop()
  if (!basename || segments.some((segment) => segment !== "**")) return null
  const wildcardIndex = basename.indexOf("*")
  if (
    wildcardIndex < 0 ||
    basename.indexOf("*", wildcardIndex + 1) >= 0 ||
    /[?{}\[\]]/.test(basename)
  ) {
    return null
  }
  const sampleName = `${basename.slice(0, wildcardIndex)}Extension preview${basename.slice(wildcardIndex + 1)}`
  const extensionIndex = sampleName.indexOf(".")
  return extensionIndex < 0
    ? { stem: sampleName, extension: "" }
    : {
        stem: sampleName.slice(0, extensionIndex),
        extension: sampleName.slice(extensionIndex),
      }
}

function baseSampleFileParts(
  extension: FileExtensionPackage
): { stem: string; extension: string } | null {
  for (const grant of extension.requestedGrants) {
    if (grant.kind !== "files.read") continue
    const parts = sampleFilePartsForPattern(grant.value)
    if (parts?.extension.toLowerCase() === ".base") return parts
  }
  return null
}

function commandUsesFileContext(
  extension: FileExtensionPackage,
  commandId: string
): boolean {
  return (extension.manifest?.contributes.menus?.["files/context"] ?? []).some(
    (item) => item.command === commandId
  )
}

function commandSampleFileParts(
  extension: FileExtensionPackage,
  commandId: string
): { stem: string; extension: string } | null {
  if (!commandUsesFileContext(extension, commandId)) return null
  for (const grant of extension.requestedGrants) {
    if (grant.kind !== "files.read") continue
    const parts = sampleFilePartsForPattern(grant.value)
    if (parts && parts.extension.toLowerCase() !== ".base") return parts
  }
  return null
}

function commandSampleContent(
  command: FileExtensionCommand,
  extension: string
): string {
  switch (extension.toLowerCase()) {
    case ".md":
    case ".markdown":
      return `# ${command.title}\n\n- [ ] Try the extension command\n- [x] Create a real resource context\n`
    case ".json":
      return `${JSON.stringify({ title: command.title, status: "sample" }, null, 2)}\n`
    case ".csv":
      return `title,status\n${JSON.stringify(command.title)},sample\n`
    case ".yaml":
    case ".yml":
      return `title: ${JSON.stringify(command.title)}\nstatus: sample\n`
    default:
      return `${command.title}\n\nSample resource created by Eidos.\n`
  }
}

function sourceFilesForPackage(
  root: string,
  extension: FileExtensionPackage
): ExtensionSourceFile[] {
  const filePaths = new Set(extension.files.map((file) => file.path))
  const candidates: Array<{
    kind: ExtensionSourceKind
    relativePath: string | undefined
  }> = [
    { kind: "manifest", relativePath: "extension.json" },
    {
      kind: "worker",
      relativePath: extension.manifest?.entrypoints.worker,
    },
    { kind: "ui", relativePath: extension.manifest?.entrypoints.ui },
    ...extension.files
      .filter((file) => /\.(?:[cm]?[jt]sx?|css)$/i.test(file.path))
      .map((file) => ({
        kind: "source" as const,
        relativePath: file.path,
      })),
  ]
  const seen = new Set<string>()
  return candidates.flatMap(({ kind, relativePath }) => {
    if (
      !relativePath ||
      !filePaths.has(relativePath) ||
      seen.has(relativePath)
    ) {
      return []
    }
    seen.add(relativePath)
    return [
      {
        kind,
        relativePath,
        path: `${root}/${extension.directoryName}/${relativePath}`,
      },
    ]
  })
}

function primarySourceFile(
  sourceFiles: readonly ExtensionSourceFile[]
): ExtensionSourceFile | null {
  return (
    sourceFiles.find((source) => source.kind === "ui") ??
    sourceFiles.find((source) => source.kind === "worker") ??
    sourceFiles.find((source) => source.kind === "source") ??
    sourceFiles.find((source) => source.kind === "manifest") ??
    null
  )
}

function diagnosticSourceFile(
  sourceFiles: readonly ExtensionSourceFile[],
  relativePath: string | undefined
): ExtensionSourceFile | null {
  if (!relativePath) return null
  return (
    sourceFiles.find((source) => source.relativePath === relativePath) ?? null
  )
}

export function FileExtensionSettings() {
  const { t } = useTranslation()
  const { currentSpace } = useCurrentSpace()
  const setCmdkOpen = useAppRuntimeStore((state) => state.setCmdkOpen)
  const openTab = useTabStore((state) => state.openTab)
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
  const [commandRun, setCommandRun] = useState<CommandRunState | null>(null)
  const [panelOpen, setPanelOpen] = useState<PanelOpenState | null>(null)
  const [editorSample, setEditorSample] = useState<EditorSampleState | null>(
    null
  )
  const [baseSample, setBaseSample] = useState<BaseSampleState | null>(null)
  const [mutationError, setMutationError] = useState<{
    packageId: string
    message: string
  } | null>(null)
  const requestGeneration = useRef(0)
  const foregroundRequestGeneration = useRef(0)
  const lastEventGeneration = useRef(0)
  const lastDevelopmentEventGeneration = useRef(new Map<string, number>())
  const installPreviewRef = useRef<FileExtensionInstallPreview | null>(null)
  const revealedCreatedPackage = useRef<string | null>(null)

  useEffect(() => {
    installPreviewRef.current = installPreview
  }, [installPreview])

  const load = useCallback(
    async (options?: { background?: boolean }) => {
      const generation = ++requestGeneration.current
      const background = options?.background === true
      if (!spaceId || currentSpace?.mode !== "file") {
        if (!background) setLoading(false)
        return
      }
      if (!isDesktopMode || !window.eidos?.fileExtensions?.discover) {
        setError(
          t(
            "space.settings.fileExtensions.desktopOnly",
            "Extension package inspection is available in the desktop app."
          )
        )
        if (!background) setLoading(false)
        return
      }

      if (!background) {
        foregroundRequestGeneration.current = generation
        setLoading(true)
      }
      setError(null)
      try {
        const nextDiscovery =
          await window.eidos.fileExtensions.discover(spaceId)
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
        if (!background && foregroundRequestGeneration.current === generation) {
          setLoading(false)
        }
      }
    },
    [currentSpace?.mode, spaceId, t]
  )

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
        sourcePath: `${result.root}/${
          createdTemplate === "text-editor"
            ? "src/editor.ts"
            : createdTemplate === "panel"
              ? "src/panel.ts"
              : createdTemplate === "base-view"
                ? "src/base-view.ts"
                : "src/extension.ts"
        }`,
        sourceKind: createdTemplate === "command" ? "worker" : "ui",
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
        const result = await mutate()
        if (isFileExtensionLocalState(result)) {
          requestGeneration.current += 1
          setLoading(false)
          setDiscovery((current) => {
            if (!current) return current
            return {
              ...current,
              packages: current.packages.map((candidate) =>
                candidate.canonicalId === result.snapshot.packageId &&
                candidate.contentDigest === result.snapshot.contentDigest &&
                candidate.permissionHash === result.snapshot.permissionHash
                  ? {
                      ...candidate,
                      lifecycleStatus: !result.trusted
                        ? "untrusted"
                        : result.enabled
                          ? "enabled"
                          : "disabled",
                      localState: result,
                    }
                  : candidate
              ),
            }
          })
        } else {
          await load()
        }
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
    lastDevelopmentEventGeneration.current.clear()
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

  const openSource = useCallback(
    (sourcePath: string) => {
      openTab(
        toSpaceFileUrl(sourcePath),
        sourcePath.split("/").at(-1) ?? sourcePath
      )
    },
    [openTab]
  )

  const createEditorSample = useCallback(
    async (
      extension: FileExtensionPackage,
      editor: NonNullable<
        NonNullable<
          FileExtensionPackage["manifest"]
        >["contributes"]["fileEditors"]
      >[number],
      parts: { stem: string; extension: string }
    ) => {
      if (!spaceId || !window.eidos?.spaceMgmt || editorSample) return
      const key = `${extension.canonicalId ?? extension.directoryName}\0${editor.id}`
      setEditorSample({ key, status: "creating" })
      try {
        const rootEntries = await window.eidos.spaceMgmt.listFiles(spaceId, "")
        const fileName = uniqueSpaceEntryName(
          rootEntries.map((entry) => entry.name),
          parts.stem,
          parts.extension
        )
        await window.eidos.spaceMgmt.createFile(
          spaceId,
          fileName,
          `# ${editor.displayName}\n\nStart editing this sample file.\n`
        )
        openTab(toSpaceFileEditorUrl(fileName, editor.id), fileName)
        setEditorSample(null)
      } catch (sampleError) {
        setEditorSample({
          key,
          status: "error",
          message:
            sampleError instanceof Error
              ? sampleError.message
              : t(
                  "space.settings.fileExtensions.createEditorSampleFailed",
                  "Unable to create the sample file."
                ),
        })
      }
    },
    [editorSample, openTab, spaceId, t]
  )

  const createBaseSample = useCallback(
    async (
      extension: FileExtensionPackage,
      baseView: FileExtensionBaseView,
      parts: { stem: string; extension: string }
    ) => {
      if (!spaceId || !window.eidos?.spaceMgmt || baseSample) return
      const key = `${extension.canonicalId ?? extension.directoryName}\0${baseView.id}`
      setBaseSample({ key, status: "creating" })
      try {
        const rootEntries = await window.eidos.spaceMgmt.listFiles(spaceId, "")
        const fileName = uniqueSpaceEntryName(
          rootEntries.map((entry) => entry.name),
          parts.stem,
          parts.extension
        )
        const tableId = "records"
        await window.eidos.spaceMgmt.createBase(spaceId, fileName, {
          title: `${baseView.displayName} preview`,
          defaultTable: {
            id: tableId,
            name: "Records",
            createDefaultView: false,
            fields: [
              {
                name: "Status",
                columnName: "status",
                type: "select",
                property: {
                  options: [
                    { id: "planned", name: "Planned", color: "gray" },
                    { id: "active", name: "Active", color: "blue" },
                    { id: "done", name: "Done", color: "green" },
                  ],
                },
              },
              {
                name: "Notes",
                columnName: "notes",
                type: "text",
              },
            ],
          },
        })
        await window.eidos.spaceMgmt.createBaseView(
          spaceId,
          fileName,
          tableId,
          {
            name: baseView.displayName,
            type: `extension:${baseView.id}`,
          }
        )
        for (const row of [
          {
            title: "Explore this extension view",
            status: "active",
            notes: "Edit the extension source and start a development session.",
          },
          {
            title: "Add another record",
            status: "planned",
            notes: "The view receives paginated Base records from Eidos.",
          },
          {
            title: "Verify the interaction",
            status: "done",
            notes: "Switch back to Grid from the view picker when needed.",
          },
        ]) {
          await window.eidos.spaceMgmt.insertBaseRow(
            spaceId,
            fileName,
            tableId,
            row
          )
        }
        openTab(toSpaceFileUrl(fileName), fileName)
        setBaseSample(null)
      } catch (sampleError) {
        setBaseSample({
          key,
          status: "error",
          message:
            sampleError instanceof Error
              ? sampleError.message
              : t(
                  "space.settings.fileExtensions.createBaseSampleFailed",
                  "Unable to create the sample Base."
                ),
        })
      }
    },
    [baseSample, openTab, spaceId, t]
  )

  const runCommand = useCallback(
    async (
      extension: FileExtensionPackage,
      command: FileExtensionCommand,
      sampleParts?: { stem: string; extension: string }
    ) => {
      if (!spaceId) return
      const snapshot = snapshotFor(extension)
      if (!snapshot) return
      const key = commandRunKey(extension, command.id)
      if (!key) return
      setCommandRun({ key, status: "running" })
      try {
        let resourcePath = ""
        if (sampleParts) {
          const rootEntries = await window.eidos.spaceMgmt.listFiles(
            spaceId,
            ""
          )
          resourcePath = uniqueSpaceEntryName(
            rootEntries.map((entry) => entry.name),
            sampleParts.stem,
            sampleParts.extension
          )
          await window.eidos.spaceMgmt.createFile(
            spaceId,
            resourcePath,
            commandSampleContent(command, sampleParts.extension)
          )
          openTab(toSpaceFileUrl(resourcePath), resourcePath)
        }
        await window.eidos.fileExtensions.executeCommand(spaceId, {
          ...snapshot,
          commandId: command.id,
          resource: { path: resourcePath },
        })
        setCommandRun({ key, status: "success" })
      } catch (error) {
        setCommandRun({
          key,
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : t(
                  "space.settings.fileExtensions.commandFailed",
                  "The extension command failed."
                ),
        })
      }
    },
    [openTab, spaceId, t]
  )

  const clearRuntimeOutput = useCallback(
    async (extension: FileExtensionPackage) => {
      if (!spaceId || !extension.canonicalId) return
      try {
        await window.eidos.fileExtensions.clearRuntimeOutput(
          spaceId,
          extension.canonicalId
        )
        setDiscovery((current) =>
          current
            ? {
                ...current,
                packages: current.packages.map((candidate) =>
                  candidate.canonicalId === extension.canonicalId
                    ? { ...candidate, runtimeOutput: [] }
                    : candidate
                ),
              }
            : current
        )
      } catch (error) {
        setMutationError({
          packageId: extension.canonicalId,
          message:
            error instanceof Error
              ? error.message
              : t(
                  "space.settings.fileExtensions.clearOutputFailed",
                  "Unable to clear extension output."
                ),
        })
      }
    },
    [spaceId, t]
  )

  const openPanel = useCallback(
    async (extension: FileExtensionPackage, panel: FileExtensionPanel) => {
      if (!spaceId) return
      const snapshot = snapshotFor(extension)
      if (!snapshot) return
      const key = panelOpenKey(extension, panel.id)
      if (!key) return
      setPanelOpen({ key, status: "opening" })
      try {
        await window.eidos.fileExtensions.openPanel(spaceId, {
          ...snapshot,
          panelId: panel.id,
        })
        setPanelOpen({ key, status: "success" })
      } catch (error) {
        setPanelOpen({
          key,
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : t(
                  "space.settings.fileExtensions.panelOpenFailed",
                  "The extension panel failed to open."
                ),
        })
      }
    },
    [spaceId, t]
  )

  const openContributionPalette = useCallback(
    (title: string) => {
      useCMDKStore.getState().setInput(title)
      setCmdkOpen(true)
    },
    [setCmdkOpen]
  )

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
        void load({ background: true })
      }
    )

    return () => {
      if (listenerId) window.eidos.off("file-extensions:changed", listenerId)
    }
  }, [load, spaceId])

  useEffect(() => {
    if (!spaceId || !isDesktopMode || !window.eidos?.fileExtensions) return
    const listenerId = window.eidos.on(
      "file-extensions:runtime-output",
      (_event: unknown, payload: unknown) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("spaceId" in payload) ||
          !("packageId" in payload) ||
          payload.spaceId !== spaceId ||
          typeof payload.packageId !== "string"
        ) {
          return
        }
        const packageId = payload.packageId
        const cleared = "cleared" in payload && payload.cleared === true
        const entry = "entry" in payload ? payload.entry : undefined
        if (
          !cleared &&
          (!entry ||
            typeof entry !== "object" ||
            !("sequence" in entry) ||
            !("timestamp" in entry) ||
            !("source" in entry) ||
            !("level" in entry) ||
            !("message" in entry) ||
            typeof entry.sequence !== "number" ||
            typeof entry.timestamp !== "number" ||
            !["worker", "panel", "file-editor", "base-view"].includes(
              String(entry.source)
            ) ||
            !["debug", "info", "log", "warn", "error"].includes(
              String(entry.level)
            ) ||
            typeof entry.message !== "string")
        ) {
          return
        }
        const runtimeEntry = entry as FileExtensionRuntimeOutput
        if (runtimeEntry.level === "error") {
          setExpandedPackages((current) => {
            if (current.has(packageId)) return current
            return new Set([...current, packageId])
          })
        }
        setDiscovery((current) => {
          if (!current) return current
          return {
            ...current,
            packages: current.packages.map((candidate) => {
              if (candidate.canonicalId !== packageId) return candidate
              if (cleared) return { ...candidate, runtimeOutput: [] }
              if (
                (candidate.runtimeOutput ?? []).some(
                  (output) => output.sequence === runtimeEntry.sequence
                )
              ) {
                return candidate
              }
              return {
                ...candidate,
                runtimeOutput: [
                  ...(candidate.runtimeOutput ?? []),
                  runtimeEntry,
                ].slice(-MAX_RUNTIME_OUTPUT_ENTRIES),
              }
            }),
          }
        })
      }
    )
    return () => {
      if (listenerId) {
        window.eidos.off("file-extensions:runtime-output", listenerId)
      }
    }
  }, [spaceId])

  useEffect(() => {
    if (!spaceId || !isDesktopMode || !window.eidos?.fileExtensions) return
    const listenerId = window.eidos.on(
      "file-extensions:development-changed",
      (_event: unknown, payload: unknown) => {
        const change = parseDevelopmentChangedPayload(payload)
        if (!change || change.spaceId !== spaceId) return
        const eventKey = `${change.packageId}\0${change.sessionId}`
        const previousGeneration =
          lastDevelopmentEventGeneration.current.get(eventKey) ?? 0
        if (change.generation <= previousGeneration) return
        lastDevelopmentEventGeneration.current.set(eventKey, change.generation)
        setDiscovery((current) => {
          if (!current) return current
          return {
            ...current,
            packages: current.packages.map((candidate) => {
              if (candidate.canonicalId !== change.packageId) return candidate
              const currentSession = candidate.developmentSession
              if (
                currentSession &&
                currentSession.sessionId !== change.sessionId
              ) {
                return candidate
              }
              if (change.status === "stopped") {
                return currentSession?.sessionId === change.sessionId
                  ? { ...candidate, developmentSession: undefined }
                  : candidate
              }
              const session = change.session
              if (!session) return candidate
              return {
                ...candidate,
                contentDigest:
                  session.currentSnapshot?.contentDigest ??
                  candidate.contentDigest,
                permissionHash:
                  session.currentSnapshot?.permissionHash ??
                  candidate.permissionHash,
                developmentSession: session,
              }
            }),
          }
        })
      }
    )
    return () => {
      if (listenerId) {
        window.eidos.off("file-extensions:development-changed", listenerId)
      }
    }
  }, [spaceId])

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
    status: FileExtensionDevelopmentSession["status"]
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

  const developmentStatusDescription = (
    development: FileExtensionDevelopmentSession
  ): string => {
    switch (development.status) {
      case "checking":
        return t(
          "space.settings.fileExtensions.devCheckingDescription",
          "Checking generation {{generation}} against the trusted development anchor.",
          { generation: development.generation }
        )
      case "ready":
        return t(
          "space.settings.fileExtensions.devReadyDescription",
          "Generation {{generation}} is running from the current source. Source-only saves compile and reload automatically.",
          { generation: development.generation }
        )
      case "invalid":
        return t(
          "space.settings.fileExtensions.devInvalidDescription",
          "Generation {{generation}} could not compile. Fix the diagnostics below and save; this session will recover automatically.",
          { generation: development.generation }
        )
      case "permissions-changed":
        return t(
          "space.settings.fileExtensions.devPermissionsChangedDescription",
          "The extension ID or requested permissions changed. Stop development, review the new source, and trust the new snapshot before running it."
        )
      case "missing":
        return t(
          "space.settings.fileExtensions.devMissingDescription",
          "The package source is missing. Restore it in the Space or stop this development session."
        )
    }
  }

  const sourceKindLabel = (kind: ExtensionSourceKind): string => {
    switch (kind) {
      case "ui":
        return t("space.settings.fileExtensions.uiEntrypoint", "UI entrypoint")
      case "worker":
        return t(
          "space.settings.fileExtensions.workerEntrypoint",
          "Worker entrypoint"
        )
      case "manifest":
        return t("space.settings.fileExtensions.manifest", "Manifest")
      case "source":
        return t("space.settings.fileExtensions.sourceFile", "Source file")
    }
  }

  const openSourceLabel = (kind: ExtensionSourceKind): string => {
    switch (kind) {
      case "ui":
        return t("space.settings.fileExtensions.openUi", "Open UI")
      case "worker":
        return t("space.settings.fileExtensions.openWorker", "Open worker")
      case "manifest":
        return t("space.settings.fileExtensions.openManifest", "Open manifest")
      case "source":
        return t("space.settings.fileExtensions.openSource", "Open source")
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
                      templateKind === "panel"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <input
                      type="radio"
                      name="local-extension-template"
                      value="panel"
                      className="sr-only"
                      checked={templateKind === "panel"}
                      onChange={() => {
                        setTemplateKind("panel")
                        setCreateError(null)
                      }}
                    />
                    <Package className="h-4 w-4" />
                    {t("space.settings.fileExtensions.panelTemplate", "Panel")}
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
                  <label
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-[5px] px-3 text-sm transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
                      creating
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer",
                      templateKind === "base-view"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <input
                      type="radio"
                      name="local-extension-template"
                      value="base-view"
                      className="sr-only"
                      checked={templateKind === "base-view"}
                      onChange={() => {
                        setTemplateKind("base-view")
                        setCreateError(null)
                      }}
                    />
                    <LayoutGrid className="h-4 w-4" />
                    {t(
                      "space.settings.fileExtensions.baseViewTemplate",
                      "Base view"
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
                    : templateKind === "panel"
                      ? t(
                          "space.settings.fileExtensions.panelTemplateDescription",
                          "Adds a Task Counter command that opens a sandboxed UI tab."
                        )
                      : templateKind === "base-view"
                        ? t(
                            "space.settings.fileExtensions.baseViewTemplateDescription",
                            "Adds a sandboxed, infinitely scrolling layout to the Base view picker."
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
                    "Each direct child is one publisher.name package. Extension source is visible and editable in Files; other .eidos state stays private."
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
                    "Enabled packages run from exact trusted source bytes. Logic executes in an isolated Worker, while panels and file editors render in sandboxed frames. Data access remains limited to host capabilities you explicitly grant."
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
                        "Next: review and enable it below, then run the command here, from the Command Palette, or from a file's context menu."
                      )
                    : createdExtension.template === "panel"
                      ? t(
                          "space.settings.fileExtensions.panelCreatedNextStep",
                          "Next: review and enable it below. Open the panel directly, or grant Markdown read access and run its command from a Markdown file to populate task counts."
                        )
                      : createdExtension.template === "base-view"
                        ? t(
                            "space.settings.fileExtensions.baseViewCreatedNextStep",
                            "Next: review its source, grant Base file read access, and enable it below. Open a .base file, add a view, then choose this extension layout."
                          )
                        : t(
                            "space.settings.fileExtensions.editorCreatedNextStep",
                            "Next: review its source, grant matching file access, and enable it below. Then open a matching file with the contributed editor."
                          )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => openSource(createdExtension.sourcePath)}
              >
                <FileCode2 />
                {openSourceLabel(createdExtension.sourceKind)}
              </Button>
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
              const sourceFiles = sourceFilesForPackage(
                discovery.root,
                extension
              )
              const primarySource = primarySourceFile(sourceFiles)
              const uninstallRequest = {
                directoryName: extension.directoryName,
                canonicalId: extension.canonicalId,
                contentDigest: extension.contentDigest,
              }
              const expanded = expandedPackages.has(packageId)
              const manageable = extension.status === "ready" && !!snapshot
              const development = extension.developmentSession
              const developmentSource =
                development?.status === "permissions-changed"
                  ? (sourceFiles.find((source) => source.kind === "manifest") ??
                    primarySource)
                  : primarySource
              const runtimeOutput = extension.runtimeOutput ?? []
              const runtimeIssue = latestRuntimeIssue(runtimeOutput)
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
              const panels = extension.manifest?.contributes.panels ?? []
              const baseViews = extension.manifest?.contributes.baseViews ?? []
              const legacyMappings = extension.legacyMappings ?? []
              const legacyConflict = legacyMappings.some(
                (mapping) => mapping.conflict !== "none"
              )
              const executionEnabled =
                !legacyConflict &&
                (extension.lifecycleStatus === "enabled" ||
                  development?.status === "ready")
              return (
                <div
                  id={packageElementId(packageId)}
                  key={extension.directoryName}
                  className="scroll-m-8 py-4"
                >
                  <div className="flex min-h-[56px] items-start justify-between gap-6">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {legacyConflict ? (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      ) : development ? (
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
                              {(
                                extension.manifest?.contributes.menus?.[
                                  "files/context"
                                ] ?? []
                              ).some((item) => item.command === commands[0]?.id)
                                ? t(
                                    "space.settings.fileExtensions.commandPaletteAndFileMenu",
                                    "Command Palette ⌘K · File menu"
                                  )
                                : t(
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
                        {baseViews[0] && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <LayoutGrid className="h-3 w-3" />
                            <span className="truncate">
                              {baseViews[0].displayName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {t(
                                "space.settings.fileExtensions.baseViewPickerTrigger",
                                "Base view picker"
                              )}
                            </span>
                          </p>
                        )}
                        {panels[0] && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Package className="h-3 w-3" />
                            <span className="truncate">
                              {panels[0].displayName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {t(
                                "space.settings.fileExtensions.panelTrigger",
                                "Command Palette or extension command"
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
                        {runtimeIssue && (
                          <p
                            role={
                              runtimeIssue.level === "error"
                                ? "alert"
                                : "status"
                            }
                            className={cn(
                              "flex min-w-0 items-start gap-1.5 text-xs leading-5",
                              runtimeIssue.level === "error"
                                ? "text-destructive"
                                : "text-amber-700 dark:text-amber-400"
                            )}
                          >
                            <SquareTerminal className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="shrink-0 font-medium">
                              {runtimeIssue.level === "error"
                                ? t(
                                    "space.settings.fileExtensions.runtimeError",
                                    "Runtime error"
                                  )
                                : t(
                                    "space.settings.fileExtensions.runtimeWarning",
                                    "Runtime warning"
                                  )}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="line-clamp-2 min-w-0 break-all">
                              {runtimeIssue.message}
                            </span>
                          </p>
                        )}
                        {diagnostics.length > 0 && (
                          <ul className="space-y-1 pt-1 text-xs text-muted-foreground">
                            {diagnostics.map((diagnostic, index) => {
                              const diagnosticSource = diagnosticSourceFile(
                                sourceFiles,
                                diagnostic.path
                              )
                              return (
                                <li
                                  key={`${diagnostic.code}-${diagnostic.path ?? diagnostic.pointer ?? index}`}
                                  className={cn(
                                    diagnostic.severity === "error" &&
                                      "text-destructive"
                                  )}
                                >
                                  <code>{diagnostic.code}</code>:{" "}
                                  {diagnostic.message}
                                  {diagnosticSource && (
                                    <button
                                      type="button"
                                      className="ml-2 font-mono underline underline-offset-2 hover:text-foreground"
                                      onClick={() =>
                                        openSource(diagnosticSource.path)
                                      }
                                    >
                                      {diagnosticSource.relativePath}
                                    </button>
                                  )}
                                  {!diagnosticSource && diagnostic.path && (
                                    <span className="ml-2 font-mono text-[11px]">
                                      {" · "}
                                      <code>{diagnostic.path}</code>
                                    </span>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {primarySource && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => openSource(primarySource.path)}
                        >
                          <FileCode2 />
                          {openSourceLabel(primarySource.kind)}
                        </Button>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal",
                          legacyConflict &&
                            "border-destructive/40 text-destructive",
                          development &&
                            !legacyConflict &&
                            "border-sky-500/40 text-sky-700 dark:text-sky-400",
                          !development &&
                            !legacyConflict &&
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
                        {legacyConflict
                          ? t(
                              "space.settings.fileExtensions.migrationConflictBadge",
                              "Migration conflict"
                            )
                          : development
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
                          <div
                            className="min-w-0"
                            role="status"
                            aria-live="polite"
                            aria-atomic="true"
                          >
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
                              {developmentStatusDescription(development)}
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
                          <div className="flex shrink-0 items-center gap-1">
                            {development.status !== "ready" &&
                              developmentSource && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    openSource(developmentSource.path)
                                  }
                                >
                                  <FileCode2 />
                                  {t(
                                    "space.settings.fileExtensions.openDevelopmentSource",
                                    "Open source"
                                  )}
                                </Button>
                              )}
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
                              {busy && (
                                <LoaderCircle className="animate-spin" />
                              )}
                              {t(
                                "space.settings.fileExtensions.stopDevelopment",
                                "Stop development"
                              )}
                            </Button>
                          </div>
                        </div>
                        {development.diagnostics.length > 0 && (
                          <div
                            className="border-t border-sky-500/20 py-3 text-xs text-destructive"
                            role="alert"
                          >
                            {development.diagnostics.map(
                              (diagnostic, index) => {
                                const diagnosticSource = diagnosticSourceFile(
                                  sourceFiles,
                                  diagnostic.path
                                )
                                return (
                                  <p key={`${diagnostic.code}-${index}`}>
                                    <code>{diagnostic.code}</code>:{" "}
                                    {diagnostic.message}
                                    {diagnosticSource && (
                                      <button
                                        type="button"
                                        className="ml-2 font-mono underline underline-offset-2 hover:text-foreground"
                                        onClick={() =>
                                          openSource(diagnosticSource.path)
                                        }
                                      >
                                        {diagnosticSource.relativePath}
                                      </button>
                                    )}
                                  </p>
                                )
                              }
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
                        {(extension.legacyPorting ||
                          legacyMappings.length > 0) && (
                          <div className="py-3">
                            <div className="flex items-start justify-between gap-6">
                              <div className="min-w-0">
                                <Label>
                                  {t(
                                    "space.settings.fileExtensions.legacyMigration",
                                    "Legacy migration"
                                  )}
                                </Label>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {legacyConflict
                                    ? t(
                                        "space.settings.fileExtensions.legacyMigrationConflict",
                                        "Migration conflict: this legacy source is linked to more than one package, or this package claims more than one source. Execution is blocked until the extra link is removed."
                                      )
                                    : legacyMappings.length > 0
                                      ? t(
                                          "space.settings.fileExtensions.legacyMigrationLinked",
                                          "The reviewed legacy archive is linked to this canonical package on this device."
                                        )
                                      : extension.legacyPorting?.valid
                                        ? t(
                                            "space.settings.fileExtensions.legacyMigrationCandidate",
                                            "PORTING.json is a candidate receipt only. Confirm it explicitly before Eidos records the legacy-to-canonical mapping."
                                          )
                                        : t(
                                            "space.settings.fileExtensions.legacyMigrationInvalid",
                                            "PORTING.json is invalid and will not be used as migration authority."
                                          )}
                                </p>
                                {extension.legacyPorting?.receipt && (
                                  <code className="mt-1 block max-w-[40rem] truncate text-[11px] text-muted-foreground">
                                    {
                                      extension.legacyPorting.receipt.source
                                        .legacyExtensionId
                                    }{" "}
                                    → {extension.canonicalId}
                                  </code>
                                )}
                                {extension.legacyPorting?.diagnostics.map(
                                  (diagnostic, index) => (
                                    <p
                                      key={`${diagnostic.code}-${index}`}
                                      className="mt-1 text-xs text-destructive"
                                    >
                                      <code>{diagnostic.code}</code>:{" "}
                                      {diagnostic.message}
                                    </p>
                                  )
                                )}
                              </div>
                              {extension.legacyPorting?.valid &&
                                extension.legacyPorting.receipt &&
                                legacyMappings.length === 0 && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      !!mutatingPackage || !!development
                                    }
                                    onClick={() =>
                                      void mutatePackage(extension, () =>
                                        window.eidos.fileExtensions.confirmLegacyPorting(
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
                                      "space.settings.fileExtensions.linkLegacySource",
                                      "Link legacy source"
                                    )}
                                  </Button>
                                )}
                            </div>
                            {legacyMappings.length > 0 && (
                              <div className="mt-3 divide-y divide-border/60 border-t border-border/60">
                                {legacyMappings.map((mapping) => (
                                  <div
                                    key={`${mapping.legacyExtensionId}-${mapping.canonicalPackageId}`}
                                    className="flex min-h-[52px] items-center justify-between gap-4 py-2"
                                  >
                                    <div className="min-w-0 text-xs">
                                      <p className="font-medium">
                                        {mapping.legacySlug ??
                                          mapping.legacyExtensionId}
                                        {mapping.conflict !== "none" && (
                                          <span className="ml-2 text-destructive">
                                            {t(
                                              "space.settings.fileExtensions.migrationConflictBadge",
                                              "Conflict"
                                            )}
                                          </span>
                                        )}
                                      </p>
                                      <code className="block max-w-[38rem] truncate text-[11px] text-muted-foreground">
                                        {mapping.archiveDigest}
                                      </code>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      disabled={
                                        !!mutatingPackage || !!development
                                      }
                                      onClick={() =>
                                        void mutatePackage(extension, () =>
                                          window.eidos.fileExtensions.retireLegacyPorting(
                                            spaceId,
                                            {
                                              legacyExtensionId:
                                                mapping.legacyExtensionId,
                                              canonicalPackageId:
                                                mapping.canonicalPackageId,
                                            }
                                          )
                                        )
                                      }
                                    >
                                      {t(
                                        "space.settings.fileExtensions.unlinkLegacySource",
                                        "Unlink"
                                      )}
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {!development && (
                          <div className="flex min-h-[72px] items-center justify-between gap-6 py-3">
                            <div className="flex min-w-0 items-start gap-2">
                              {trusted &&
                              missingGrants.length === 0 &&
                              enabled ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                              ) : (
                                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <div className="min-w-0">
                                <Label>
                                  {t(
                                    "space.settings.fileExtensions.setupProgress",
                                    "Setup progress"
                                  )}
                                </Label>
                                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                  {legacyConflict
                                    ? t(
                                        "space.settings.fileExtensions.setupResolveMigration",
                                        "Resolve the migration conflict before this extension can run."
                                      )
                                    : !trusted
                                      ? t(
                                          "space.settings.fileExtensions.setupReviewSource",
                                          "Step 1 of 3 · Review the source, then trust this exact snapshot below."
                                        )
                                      : missingGrants.length > 0
                                        ? t(
                                            "space.settings.fileExtensions.setupReviewPermissions",
                                            "Step 2 of 3 · Review requested capabilities ({{count}}) before enabling the extension.",
                                            { count: missingGrants.length }
                                          )
                                        : !enabled
                                          ? t(
                                              "space.settings.fileExtensions.setupEnableExtension",
                                              "Step 3 of 3 · Enable the extension to make its contributions available."
                                            )
                                          : t(
                                              "space.settings.fileExtensions.setupReady",
                                              "Ready · This exact snapshot is trusted, permitted, and enabled."
                                            )}
                                </p>
                              </div>
                            </div>
                            {!legacyConflict && !trusted && primarySource && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openSource(primarySource.path)}
                              >
                                <FileCode2 />
                                {t(
                                  "space.settings.fileExtensions.reviewSource",
                                  "Review source"
                                )}
                              </Button>
                            )}
                            {!legacyConflict &&
                              trusted &&
                              missingGrants.length > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    document
                                      .getElementById(
                                        `${packageElementId(packageId)}-permissions`
                                      )
                                      ?.scrollIntoView({
                                        block: "nearest",
                                        behavior: "smooth",
                                      })
                                  }
                                >
                                  {t(
                                    "space.settings.fileExtensions.reviewPermissions",
                                    "Review permissions"
                                  )}
                                </Button>
                              )}
                            {!legacyConflict &&
                              trusted &&
                              missingGrants.length === 0 &&
                              !enabled && (
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!!mutatingPackage}
                                  onClick={() =>
                                    void mutatePackage(extension, () =>
                                      window.eidos.fileExtensions.setEnabled(
                                        spaceId,
                                        snapshot,
                                        true
                                      )
                                    )
                                  }
                                >
                                  {busy && (
                                    <LoaderCircle className="animate-spin" />
                                  )}
                                  {t(
                                    "space.settings.fileExtensions.enableExtension",
                                    "Enable extension"
                                  )}
                                </Button>
                              )}
                            {!legacyConflict &&
                              trusted &&
                              missingGrants.length === 0 &&
                              enabled && (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/40 font-normal text-emerald-700 dark:text-emerald-400"
                                >
                                  {t(
                                    "space.settings.fileExtensions.ready",
                                    "Ready"
                                  )}
                                </Badge>
                              )}
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
                              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                {t(
                                  "space.settings.fileExtensions.startDevelopmentDescription",
                                  "Start development before editing source. Source-only saves will compile and reload without trusting every new digest; permission changes remain blocked."
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

                        <div
                          id={`${packageElementId(packageId)}-permissions`}
                          className="scroll-m-6 py-3"
                        >
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

                        {sourceFiles.length > 0 && (
                          <div className="py-3">
                            <Label>
                              {t(
                                "space.settings.fileExtensions.sourceFiles",
                                "Source files"
                              )}
                            </Label>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t(
                                "space.settings.fileExtensions.sourceFilesDescription",
                                "Open the manifest, Worker, and UI entrypoints directly in the Space editor."
                              )}
                            </p>
                            <div className="mt-2 divide-y divide-border/60">
                              {sourceFiles.map((source) => (
                                <div
                                  key={source.relativePath}
                                  className="flex min-h-11 items-center justify-between gap-4 py-2"
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium">
                                        {sourceKindLabel(source.kind)}
                                      </p>
                                      <code className="block truncate text-[11px] text-muted-foreground">
                                        {source.relativePath}
                                      </code>
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openSource(source.path)}
                                  >
                                    {t(
                                      "space.settings.fileExtensions.openFile",
                                      "Open"
                                    )}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {runtimeOutput.length > 0 && (
                          <div className="py-3">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <Label className="flex items-center gap-2">
                                  <SquareTerminal className="h-4 w-4 text-muted-foreground" />
                                  {t(
                                    "space.settings.fileExtensions.runtimeOutput",
                                    "Runtime output"
                                  )}
                                </Label>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {t(
                                    "space.settings.fileExtensions.runtimeOutputDescription",
                                    "Recent console output from the sandboxed Worker and UI surfaces. Kept in memory for this app session."
                                  )}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  void clearRuntimeOutput(extension)
                                }
                              >
                                {t(
                                  "space.settings.fileExtensions.clearOutput",
                                  "Clear"
                                )}
                              </Button>
                            </div>
                            <div
                              role="log"
                              aria-label={t(
                                "space.settings.fileExtensions.runtimeOutput",
                                "Runtime output"
                              )}
                              className="mt-2 max-h-48 overflow-y-auto border-y border-border/60 font-mono text-[11px]"
                            >
                              {runtimeOutput.map((entry) => (
                                <div
                                  key={entry.sequence}
                                  className="grid grid-cols-[4.5rem_4.5rem_3.5rem_minmax(0,1fr)] gap-2 border-b border-border/40 py-1.5 last:border-b-0"
                                >
                                  <time className="text-muted-foreground">
                                    {new Date(
                                      entry.timestamp
                                    ).toLocaleTimeString(undefined, {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    })}
                                  </time>
                                  <span className="truncate uppercase text-muted-foreground">
                                    {entry.source === "file-editor"
                                      ? "editor"
                                      : entry.source}
                                  </span>
                                  <span
                                    className={cn(
                                      "uppercase text-muted-foreground",
                                      entry.level === "error" &&
                                        "text-destructive",
                                      entry.level === "warn" &&
                                        "text-amber-700 dark:text-amber-400"
                                    )}
                                  >
                                    {entry.level}
                                  </span>
                                  <pre className="min-w-0 whitespace-pre-wrap break-words text-foreground">
                                    {entry.message}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(commands.length > 0 ||
                          panels.length > 0 ||
                          fileEditors.length > 0 ||
                          baseViews.length > 0) && (
                          <div className="py-3">
                            <Label>
                              {t(
                                "space.settings.fileExtensions.howToUse",
                                "How to use"
                              )}
                            </Label>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {!trusted
                                ? t(
                                    "space.settings.fileExtensions.contributionsUntrusted",
                                    "Review and trust this exact snapshot before enabling it."
                                  )
                                : legacyConflict
                                  ? t(
                                      "space.settings.fileExtensions.contributionsMigrationConflict",
                                      "Execution is blocked until the legacy migration conflict is resolved."
                                    )
                                  : !executionEnabled
                                    ? t(
                                        "space.settings.fileExtensions.contributionsDisabled",
                                        "This snapshot is trusted but disabled. Enable it to add its contributions to Eidos."
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
                              {commands.map((command) => {
                                const requiresFileResource =
                                  commandUsesFileContext(
                                    extension,
                                    command.id
                                  ) &&
                                  extension.requestedGrants.some(
                                    (grant) => grant.kind === "files.read"
                                  )
                                const sampleParts = commandSampleFileParts(
                                  extension,
                                  command.id
                                )
                                const canRunFromSettings =
                                  !requiresFileResource || !!sampleParts
                                const commandReadGrantMissing =
                                  requiresFileResource && missingReadGrant
                                return (
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
                                        {commandRun?.key ===
                                          commandRunKey(
                                            extension,
                                            command.id
                                          ) &&
                                          commandRun.status === "success" && (
                                            <p
                                              role="status"
                                              className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400"
                                            >
                                              {t(
                                                "space.settings.fileExtensions.commandCompleted",
                                                "Command completed."
                                              )}
                                            </p>
                                          )}
                                        {commandRun?.key ===
                                          commandRunKey(
                                            extension,
                                            command.id
                                          ) &&
                                          commandRun.status === "error" && (
                                            <p
                                              role="alert"
                                              className="mt-0.5 max-w-xl text-xs text-destructive"
                                            >
                                              {commandRun.message}
                                            </p>
                                          )}
                                      </div>
                                    </div>
                                    {executionEnabled &&
                                    !commandReadGrantMissing &&
                                    canRunFromSettings ? (
                                      <div className="flex shrink-0 items-center gap-1">
                                        <Button
                                          type="button"
                                          size="sm"
                                          disabled={
                                            commandRun?.status === "running"
                                          }
                                          onClick={() =>
                                            void runCommand(
                                              extension,
                                              command,
                                              sampleParts ?? undefined
                                            )
                                          }
                                        >
                                          {commandRun?.key ===
                                            commandRunKey(
                                              extension,
                                              command.id
                                            ) &&
                                          commandRun.status === "running" ? (
                                            <LoaderCircle className="animate-spin" />
                                          ) : (
                                            <Play />
                                          )}
                                          {commandRun?.key ===
                                            commandRunKey(
                                              extension,
                                              command.id
                                            ) && commandRun.status === "running"
                                            ? t(
                                                "space.settings.fileExtensions.runningCommand",
                                                "Running…"
                                              )
                                            : t(
                                                sampleParts
                                                  ? "space.settings.fileExtensions.runCommandWithSample"
                                                  : "space.settings.fileExtensions.runCommand",
                                                sampleParts
                                                  ? "Run with sample file"
                                                  : "Run"
                                              )}
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            openContributionPalette(
                                              command.title
                                            )
                                          }
                                        >
                                          <CommandIcon />
                                          {t(
                                            "space.settings.fileExtensions.openCommandPalette",
                                            "Command Palette"
                                          )}
                                          <kbd className="ml-1 text-[10px] text-muted-foreground">
                                            ⌘K
                                          </kbd>
                                        </Button>
                                      </div>
                                    ) : executionEnabled &&
                                      commandReadGrantMissing ? (
                                      <p className="max-w-64 text-right text-xs leading-5 text-muted-foreground">
                                        {t(
                                          "space.settings.fileExtensions.commandMissingReadGrantInstructions",
                                          "Grant matching file read access below before running this command."
                                        )}
                                      </p>
                                    ) : executionEnabled ? (
                                      <p className="max-w-72 text-right text-xs leading-5 text-muted-foreground">
                                        {t(
                                          "space.settings.fileExtensions.runCommandFromMatchingFileInstructions",
                                          "Right-click a matching file in Files to run this command with its resource context."
                                        )}
                                      </p>
                                    ) : legacyConflict ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled
                                      >
                                        {t(
                                          "space.settings.fileExtensions.resolveMigration",
                                          "Resolve migration link"
                                        )}
                                      </Button>
                                    ) : trusted ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={
                                          !!mutatingPackage || !!development
                                        }
                                        onClick={() =>
                                          void mutatePackage(extension, () =>
                                            window.eidos.fileExtensions.setEnabled(
                                              spaceId,
                                              snapshot,
                                              true
                                            )
                                          )
                                        }
                                      >
                                        {busy && (
                                          <LoaderCircle className="animate-spin" />
                                        )}
                                        {t(
                                          "space.settings.fileExtensions.enableExtension",
                                          "Enable extension"
                                        )}
                                      </Button>
                                    ) : (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled
                                      >
                                        {t(
                                          "space.settings.fileExtensions.trustSourceFirst",
                                          "Trust source first"
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                )
                              })}
                              {panels.map((panel) => {
                                const openKey = panelOpenKey(
                                  extension,
                                  panel.id
                                )
                                const currentPanelOpen =
                                  panelOpen?.key === openKey ? panelOpen : null
                                return (
                                  <div
                                    key={panel.id}
                                    className="flex min-h-[56px] items-center justify-between gap-4 py-2"
                                  >
                                    <div className="flex min-w-0 items-start gap-2">
                                      <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                          {panel.displayName}
                                        </p>
                                        <code className="block truncate text-[11px] text-muted-foreground">
                                          {panel.id}
                                        </code>
                                        {currentPanelOpen?.status ===
                                          "success" && (
                                          <p
                                            role="status"
                                            className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400"
                                          >
                                            {t(
                                              "space.settings.fileExtensions.panelOpened",
                                              "Panel opened in a tab."
                                            )}
                                          </p>
                                        )}
                                        {currentPanelOpen?.status ===
                                          "error" && (
                                          <p
                                            role="alert"
                                            className="mt-0.5 max-w-xl text-xs text-destructive"
                                          >
                                            {currentPanelOpen.message}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    {executionEnabled ? (
                                      <div className="flex shrink-0 items-center gap-1">
                                        <Button
                                          type="button"
                                          size="sm"
                                          disabled={
                                            currentPanelOpen?.status ===
                                            "opening"
                                          }
                                          onClick={() =>
                                            void openPanel(extension, panel)
                                          }
                                        >
                                          {currentPanelOpen?.status ===
                                          "opening" ? (
                                            <LoaderCircle className="animate-spin" />
                                          ) : (
                                            <Package />
                                          )}
                                          {currentPanelOpen?.status ===
                                          "opening"
                                            ? t(
                                                "space.settings.fileExtensions.openingPanel",
                                                "Opening…"
                                              )
                                            : t(
                                                "space.settings.fileExtensions.openPanel",
                                                "Open panel"
                                              )}
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            openContributionPalette(
                                              panel.displayName
                                            )
                                          }
                                        >
                                          <CommandIcon />
                                          {t(
                                            "space.settings.fileExtensions.openCommandPalette",
                                            "Command Palette"
                                          )}
                                          <kbd className="ml-1 text-[10px] text-muted-foreground">
                                            ⌘K
                                          </kbd>
                                        </Button>
                                      </div>
                                    ) : legacyConflict ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled
                                      >
                                        {t(
                                          "space.settings.fileExtensions.resolveMigration",
                                          "Resolve migration link"
                                        )}
                                      </Button>
                                    ) : trusted ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={
                                          !!mutatingPackage || !!development
                                        }
                                        onClick={() =>
                                          void mutatePackage(extension, () =>
                                            window.eidos.fileExtensions.setEnabled(
                                              spaceId,
                                              snapshot,
                                              true
                                            )
                                          )
                                        }
                                      >
                                        {busy && (
                                          <LoaderCircle className="animate-spin" />
                                        )}
                                        {t(
                                          "space.settings.fileExtensions.enableExtension",
                                          "Enable extension"
                                        )}
                                      </Button>
                                    ) : (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled
                                      >
                                        {t(
                                          "space.settings.fileExtensions.trustSourceFirst",
                                          "Trust source first"
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                )
                              })}
                              {baseViews.map((baseView) => {
                                const sampleParts =
                                  baseSampleFileParts(extension)
                                const sampleKey = `${packageId}\0${baseView.id}`
                                return (
                                  <div
                                    key={baseView.id}
                                    className="flex min-h-[56px] items-center justify-between gap-4 py-2"
                                  >
                                    <div className="flex min-w-0 items-start gap-2">
                                      <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                          {baseView.displayName}
                                        </p>
                                        <code className="block truncate text-[11px] text-muted-foreground">
                                          {baseView.id}
                                        </code>
                                      </div>
                                    </div>
                                    {!trusted ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled
                                      >
                                        {t(
                                          "space.settings.fileExtensions.trustSourceFirst",
                                          "Trust source first"
                                        )}
                                      </Button>
                                    ) : legacyConflict ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled
                                      >
                                        {t(
                                          "space.settings.fileExtensions.resolveMigration",
                                          "Resolve migration link"
                                        )}
                                      </Button>
                                    ) : !executionEnabled ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={
                                          !!mutatingPackage || !!development
                                        }
                                        onClick={() =>
                                          void mutatePackage(extension, () =>
                                            window.eidos.fileExtensions.setEnabled(
                                              spaceId,
                                              snapshot,
                                              true
                                            )
                                          )
                                        }
                                      >
                                        {busy && (
                                          <LoaderCircle className="animate-spin" />
                                        )}
                                        {t(
                                          "space.settings.fileExtensions.enableExtension",
                                          "Enable extension"
                                        )}
                                      </Button>
                                    ) : missingReadGrant ? (
                                      <p className="max-w-64 text-right text-xs leading-5 text-muted-foreground">
                                        {t(
                                          "space.settings.fileExtensions.baseViewMissingReadGrantInstructions",
                                          "Grant matching .base file read access below."
                                        )}
                                      </p>
                                    ) : (
                                      <div className="flex max-w-96 shrink-0 items-center justify-end gap-2">
                                        <p className="text-right text-xs leading-5 text-foreground">
                                          {t(
                                            "space.settings.fileExtensions.openBaseViewInstructions",
                                            "Open a .base file, add a view, then choose {{name}}",
                                            { name: baseView.displayName }
                                          )}
                                        </p>
                                        {sampleParts && (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={
                                              baseSample?.status === "creating"
                                            }
                                            onClick={() =>
                                              void createBaseSample(
                                                extension,
                                                baseView,
                                                sampleParts
                                              )
                                            }
                                          >
                                            {baseSample?.key === sampleKey &&
                                            baseSample.status === "creating" ? (
                                              <LoaderCircle className="animate-spin" />
                                            ) : (
                                              <FilePlus2 />
                                            )}
                                            {t(
                                              "space.settings.fileExtensions.createSampleBase",
                                              "Create sample Base"
                                            )}
                                          </Button>
                                        )}
                                        {baseSample?.key === sampleKey &&
                                          baseSample.status === "error" && (
                                            <p
                                              role="alert"
                                              className="max-w-56 text-xs text-destructive"
                                            >
                                              {baseSample.message}
                                            </p>
                                          )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                              {fileEditors.map((editor) => {
                                const sampleParts = sampleFilePartsForPattern(
                                  editor.selector[0]?.filenamePattern
                                )
                                const sampleKey = `${packageId}\0${editor.id}`
                                return (
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
                                    {!trusted ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled
                                      >
                                        {t(
                                          "space.settings.fileExtensions.trustSourceFirst",
                                          "Trust source first"
                                        )}
                                      </Button>
                                    ) : legacyConflict ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled
                                      >
                                        {t(
                                          "space.settings.fileExtensions.resolveMigration",
                                          "Resolve migration link"
                                        )}
                                      </Button>
                                    ) : !executionEnabled ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={
                                          !!mutatingPackage || !!development
                                        }
                                        onClick={() =>
                                          void mutatePackage(extension, () =>
                                            window.eidos.fileExtensions.setEnabled(
                                              spaceId,
                                              snapshot,
                                              true
                                            )
                                          )
                                        }
                                      >
                                        {busy && (
                                          <LoaderCircle className="animate-spin" />
                                        )}
                                        {t(
                                          "space.settings.fileExtensions.enableExtension",
                                          "Enable extension"
                                        )}
                                      </Button>
                                    ) : missingReadGrant ? (
                                      <p className="max-w-64 text-right text-xs leading-5 text-muted-foreground">
                                        {t(
                                          "space.settings.fileExtensions.editorMissingReadGrantInstructions",
                                          "Grant matching file read access below."
                                        )}
                                      </p>
                                    ) : (
                                      <div className="flex max-w-80 shrink-0 items-center justify-end gap-2">
                                        <p className="text-right text-xs leading-5 text-foreground">
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
                                        {sampleParts && (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={
                                              editorSample?.status ===
                                              "creating"
                                            }
                                            onClick={() =>
                                              void createEditorSample(
                                                extension,
                                                editor,
                                                sampleParts
                                              )
                                            }
                                          >
                                            {editorSample?.key === sampleKey &&
                                            editorSample.status ===
                                              "creating" ? (
                                              <LoaderCircle className="animate-spin" />
                                            ) : (
                                              <FilePlus2 />
                                            )}
                                            {t(
                                              "space.settings.fileExtensions.createSampleFile",
                                              "Create sample file"
                                            )}
                                          </Button>
                                        )}
                                        {editorSample?.key === sampleKey &&
                                          editorSample.status === "error" && (
                                            <p
                                              role="alert"
                                              className="max-w-56 text-xs text-destructive"
                                            >
                                              {editorSample.message}
                                            </p>
                                          )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

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
