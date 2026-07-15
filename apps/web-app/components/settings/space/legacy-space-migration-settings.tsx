import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  FolderOpen,
  FolderOutput,
  Image,
  LoaderCircle,
  PackageOpen,
  Table2,
  TriangleAlert,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useSpaceMigration } from "@/apps/web-app/hooks/use-space-migration"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

const PHASE_LABELS = {
  preparing: "Preparing export…",
  documents: "Exporting documents…",
  tables: "Building Base…",
  assets: "Copying assets…",
  extensions: "Archiving legacy extensions…",
  validating: "Validating result…",
  reporting: "Writing migration report…",
  finalizing: "Installing new Space…",
} as const

export function LegacySpaceMigrationSettings() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { currentSpace } = useCurrentSpace()
  const {
    available,
    planHandle,
    result,
    operation,
    progress,
    error,
    createPlan,
    executePlan,
    reset,
  } = useSpaceMigration(currentSpace?.id)

  if (!currentSpace || currentSpace.mode !== "legacy") return null

  const plan = planHandle?.plan
  const errors =
    plan?.issues.filter((issue) => issue.severity === "error") ?? []
  const warnings =
    plan?.issues.filter((issue) => issue.severity === "warning") ?? []
  const busy = operation !== null

  const chooseTarget = async () => {
    const targetRoot = await window.eidos.selectFolder()
    if (!targetRoot) return
    try {
      await createPlan(targetRoot)
    } catch {
      // The hook exposes the error inline.
    }
  }

  const runExport = async () => {
    try {
      await executePlan()
    } catch {
      // The hook exposes the error inline.
    }
  }

  const openExportedSpace = async () => {
    if (!result) return
    try {
      const registration = await window.eidos.spaceMgmt.registerSpace(
        result.targetRoot,
        {
          customName: currentSpace.name,
          mode: "file",
        }
      )
      if (!registration.success || !registration.space) {
        throw new Error(
          registration.error || "Unable to register exported Space"
        )
      }
      await window.eidos.spaceMgmt.switchSpace(registration.space.id)
    } catch (cause) {
      toast({
        title: t(
          "space.settings.migration.openFailed",
          "Unable to open exported Space"
        ),
        description: cause instanceof Error ? cause.message : String(cause),
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-0" data-settings-row-groups="true">
      <div className="pb-2">
        <h3>{t("space.settings.migration.group", "File-based Space")}</h3>
      </div>
      <hr />

      <div className="divide-y divide-border/70">
        <div className="flex min-h-[92px] items-center justify-between gap-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <FolderOutput className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-0.5">
              <Label>
                {t(
                  "space.settings.migration.exportTitle",
                  "Export as a file-based Space"
                )}
              </Label>
              <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
                {t(
                  "space.settings.migration.exportDescription",
                  "Create a new Space with Markdown documents, one main.base, visible assets, and a non-executable archive of legacy extensions. The current database Space stays unchanged."
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!available || busy}
            onClick={() => void chooseTarget()}
          >
            {operation === "planning" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            {plan
              ? t("space.settings.migration.changeTarget", "Change target")
              : t("space.settings.migration.chooseTarget", "Choose target")}
          </Button>
        </div>

        {plan ? (
          <div className="py-5">
            <div className="mb-4 min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("space.settings.migration.target", "Target")}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-foreground/80">
                {plan.targetRoot}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
              <MigrationStat
                icon={FileText}
                label={t("space.settings.migration.documents", "Documents")}
                value={plan.summary.documentCount}
              />
              <MigrationStat
                icon={Table2}
                label={t("space.settings.migration.tables", "Tables")}
                value={plan.summary.tableCount}
              />
              <MigrationStat
                icon={Database}
                label={t("space.settings.migration.rows", "Rows")}
                value={plan.summary.rowCount}
              />
              <MigrationStat
                icon={Image}
                label={t("space.settings.migration.assets", "Assets")}
                value={plan.summary.assetCount}
              />
              <MigrationStat
                icon={PackageOpen}
                label={t(
                  "space.settings.migration.extensions",
                  "Extension archives"
                )}
                value={plan.summary.extensionCount}
              />
            </div>

            {errors.length > 0 || warnings.length > 0 ? (
              <div className="mt-5 space-y-2 border-t border-border/70 pt-4">
                <div className="flex flex-wrap gap-2">
                  {errors.length > 0 ? (
                    <Badge variant="destructive">
                      {errors.length} {t("common.errors", "errors")}
                    </Badge>
                  ) : null}
                  {warnings.length > 0 ? (
                    <Badge variant="outline">
                      {warnings.length} {t("common.warnings", "warnings")}
                    </Badge>
                  ) : null}
                </div>
                <div className="max-h-44 space-y-1 overflow-y-auto pr-2 text-xs">
                  {[...errors, ...warnings].map((issue, index) => (
                    <div
                      key={`${issue.code}-${issue.sourceId ?? index}-${index}`}
                      className="flex items-start gap-2 py-1"
                    >
                      {issue.severity === "error" ? (
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      ) : (
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      )}
                      <span className="leading-5 text-muted-foreground">
                        {issue.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-between gap-4 border-t border-border/70 pt-4">
              <p className="text-xs text-muted-foreground">
                {errors.length > 0
                  ? t(
                      "space.settings.migration.resolveErrors",
                      "Resolve blocking errors before exporting."
                    )
                  : t(
                      "space.settings.migration.ready",
                      "The source is read-only and the target must stay empty."
                    )}
              </p>
              <Button
                size="sm"
                disabled={busy || errors.length > 0}
                onClick={() => void runExport()}
              >
                {operation === "exporting" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderOutput className="h-4 w-4" />
                )}
                {operation === "exporting"
                  ? t("space.settings.migration.exporting", "Exporting…")
                  : t("space.settings.migration.export", "Export Space")}
              </Button>
            </div>
          </div>
        ) : null}

        {operation === "exporting" && progress ? (
          <div className="py-4">
            <div className="mb-2 flex items-center justify-between gap-4 text-xs">
              <span className="text-foreground/80">
                {PHASE_LABELS[progress.phase]}
              </span>
              {progress.currentPath ? (
                <span className="max-w-[50%] truncate font-mono text-muted-foreground">
                  {progress.currentPath}
                </span>
              ) : null}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{
                  width: `${Math.max(
                    8,
                    Math.min(
                      100,
                      progress.total > 0
                        ? (progress.completed / progress.total) * 100
                        : 8
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="py-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <Label>
                  {t("space.settings.migration.complete", "Export complete")}
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "space.settings.migration.completeDescription",
                    "The new Space passed Markdown, Base, row, field, view, reference, asset, and legacy extension archive validation."
                  )}
                </p>
                <p className="mt-2 truncate font-mono text-xs text-foreground/70">
                  {result.targetRoot}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  window.eidos.showInFileManager(result.targetRoot)
                }
              >
                {t("space.settings.migration.showInFinder", "Show in Finder")}
              </Button>
              <Button variant="outline" size="sm" onClick={reset}>
                {t("space.settings.migration.exportAnother", "Export again")}
              </Button>
              <Button size="sm" onClick={() => void openExportedSpace()}>
                {t("space.settings.migration.openSpace", "Open new Space")}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 py-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error.message}</span>
          </div>
        ) : null}
        {!available ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t(
              "space.settings.migration.desktopOnly",
              "Open this Space in the desktop app to export it as a file-based Space."
            )}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function MigrationStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-lg font-medium tabular-nums leading-5">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
