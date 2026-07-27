import {
  AlertCircle,
  FolderOpen,
  FolderOutput,
  FolderSync,
  LoaderCircle,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useSpaceMigration } from "@/apps/web-app/hooks/use-space-migration"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

import { SettingsRow, SettingsRows, SettingsSection } from "../settings-surface"

export function LegacySpaceMigrationSettings() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { currentSpace } = useCurrentSpace()
  const legacySpaceId =
    currentSpace?.mode === "legacy" ? currentSpace.id : undefined
  const { available, result, operation, error, createPlan, executePlan } =
    useSpaceMigration(legacySpaceId)

  if (!currentSpace || currentSpace.mode !== "legacy") return null

  const busy = operation !== null

  const openExportedSpace = async (migrationResult: typeof result = result) => {
    if (!migrationResult) return
    try {
      const registration = await window.eidos.spaceMgmt.registerSpace(
        migrationResult.targetRoot,
        {
          customName: currentSpace.name,
          mode: "file",
        }
      )
      if (!registration.success || !registration.space) {
        throw new Error(
          registration.error || "Unable to register migrated Space"
        )
      }
      await window.eidos.spaceMgmt.switchSpace(registration.space.id)
    } catch (cause) {
      toast({
        title: t(
          "space.settings.migration.openFailed",
          "Unable to open migrated Space"
        ),
        description: cause instanceof Error ? cause.message : String(cause),
        variant: "destructive",
      })
    }
  }

  const migrateSpace = async () => {
    const targetRoot = await window.eidos.selectFolder()
    if (!targetRoot) return
    try {
      const handle = await createPlan(targetRoot)
      const blockingIssues = handle.plan.issues.filter(
        (issue) => issue.severity === "error"
      )
      if (blockingIssues.length > 0) {
        const firstIssue = blockingIssues[0]!
        toast({
          title: t(
            "space.settings.migration.blocked",
            "Unable to migrate Space"
          ),
          description:
            blockingIssues.length === 1
              ? firstIssue.message
              : `${firstIssue.message} (+${blockingIssues.length - 1})`,
          variant: "destructive",
        })
        return
      }
      const migrationResult = await executePlan()
      await openExportedSpace(migrationResult)
    } catch {
      // The hook exposes migration failures inline.
    }
  }

  const runPrimaryAction = () => {
    if (result) return openExportedSpace()
    return migrateSpace()
  }

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t("space.settings.migration.group", "File-based Space")}
      >
        <SettingsRows>
          <SettingsRow
            icon={<FolderSync />}
            className="min-h-[92px]"
            title={t(
              "space.settings.migration.actionTitle",
              "Migrate to a file-based Space"
            )}
            description={
              <>
                <span className="block max-w-2xl">
                  {available
                    ? t(
                        "space.settings.migration.description",
                        "Choose an empty folder. Eidos creates a new Space and leaves this Space unchanged."
                      )
                    : t(
                        "space.settings.migration.desktopOnly",
                        "Open this Space in the desktop app to migrate it."
                      )}
                </span>
                {error ? (
                  <span className="flex items-start gap-2 pt-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error.message}</span>
                  </span>
                ) : null}
              </>
            }
          >
            <Button
              size="sm"
              className="shrink-0"
              disabled={!available || busy}
              onClick={() => void runPrimaryAction()}
            >
              {busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : result ? (
                <FolderOpen className="h-4 w-4" />
              ) : (
                <FolderOutput className="h-4 w-4" />
              )}
              {operation === "planning"
                ? t("space.settings.migration.preparing", "Preparing…")
                : operation === "exporting"
                  ? t("space.settings.migration.migrating", "Migrating…")
                  : result
                    ? t(
                        "space.settings.migration.openSpace",
                        "Open migrated Space"
                      )
                    : t("space.settings.migration.migrate", "Migrate Space")}
            </Button>
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>
    </div>
  )
}
