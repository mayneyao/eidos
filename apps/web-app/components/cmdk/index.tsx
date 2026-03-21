"use client"

import { useEffect, useState } from "react"
import { useKeyPress } from "ahooks"
import {
  Bot,
  Clock3Icon,
  FilePlus2Icon,
  Keyboard,
  LayoutGrid,
  PaintBucket,
  Palette,
  RefreshCcwIcon,
  Settings,
  TableIcon,
  Terminal,
  Wand2,
  Wrench,
} from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { useTranslation } from "react-i18next"

import { isDesktopMode, isInkServiceMode } from "@/lib/env"
import { getToday } from "@/lib/utils"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useToast } from "@/components/ui/use-toast"
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useFavBlocks } from "@/apps/web-app/hooks/use-fav-blocks"
import { useSettings } from "@/apps/web-app/hooks/use-settings"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useLastOpened } from "@/apps/web-app/pages/[database]/hook"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { ThemeStudio } from "../theme-studio"
import { DocActionCommandItems } from "./doc-actions"
import { useCMDKGoto, useInput } from "./hooks"
import { ImportSchema } from "./import-schema"
import { SecondaryView } from "./secondary-view"

type SecondaryView = {
  component: React.ReactNode
  title: string
} | null

export function CommandDialogDemo() {
  const {
    isCmdkOpen,
    setCmdkOpen,
    isGodMode,
    setGodMode,
    isKeyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
  } = useAppRuntimeStore()
  const { openSettingsModal } = useSettings()
  const { input, setInput, mode } = useInput()
  const { resolvedTheme, setTheme } = useTheme()
  const { space } = useCurrentPathInfo()
  const [secondaryView, setSecondaryView] = useState<SecondaryView>(null)
  const { resetTabs } = useFavBlocks()

  const currentNode = useCurrentNode()

  useKeyPress(["ctrl.k", "meta.k"], (e) => {
    e.preventDefault()
    setCmdkOpen(!isCmdkOpen)
  })

  const { isRightPanelOpen: isAiOpen, setIsRightPanelOpen: setIsAiOpen } =
    useSpaceAppStore()
  const { lastOpenedDatabase } = useLastOpened()

  const {
    createDoc,
    rebuildFTS,
    migrateFilePaths,
    needsPathMigration,
    migrateDocFilePaths,
    migrateAllDocFilePaths,
    needsDocPathMigration,
    migrateTableFilePaths,
    needsTableFilePathMigration,
    fixTableSchema,
    needsTableSchemaFix,
  } = useSqlite()
  const goto = useCMDKGoto()
  const [isMigrating, setIsMigrating] = useState(false)
  const [isMigratingDoc, setIsMigratingDoc] = useState(false)
  const [isMigratingTable, setIsMigratingTable] = useState(false)
  const [isFixingSchema, setIsFixingSchema] = useState(false)
  const [isCliInstalled, setIsCliInstalled] = useState<boolean | null>(null)
  const [isInstallingCli, setIsInstallingCli] = useState(false)
  const { toast } = useToast()

  // Check CLI installation status on mount (desktop only)
  useEffect(() => {
    if (isDesktopMode && window.eidos?.cli) {
      window.eidos.cli.isInstalled().then(setIsCliInstalled)
    }
  }, [])

  // Use current workspace in desktop mode, otherwise use lastOpenedDatabase
  const goEveryday = goto(`/journals`)

  const today = getToday()
  const goToday = goto(`/journals/${today}`)
  const goShare = goto("/share")

  const switchTheme = () => {
    const newTheme = resolvedTheme === "light" ? "dark" : "light"
    setTheme(newTheme)
  }

  const toggleGodMode = () => {
    setGodMode(!isGodMode)
    setCmdkOpen(false)
  }

  const rebuildTableFTS = async (id: string) => {
    if (currentNode?.type === "table") {
      await rebuildFTS(id)
      setCmdkOpen(false)
    }
  }

  /**
   * Migrate file paths in table file fields
   * 修复表格中的 file 字段的路径格式
   *
   * This function fixes file field paths in the current table by converting old path formats
   * to the new standardized format. It checks if migration is needed before proceeding.
   */
  const handleMigrateTableFilePaths = async () => {
    if (!currentNode || currentNode.type !== "table") return

    setIsMigratingTable(true)
    try {
      const needsMigration = await needsTableFilePathMigration(currentNode.id)
      if (!needsMigration) {
        toast({
          title: t(
            "cmdk.migrateTableFilePaths.noMigrationNeeded",
            "No Migration Needed"
          ),
          description: t(
            "cmdk.migrateTableFilePaths.noMigrationNeededDesc",
            "This table's file paths are already in the correct format."
          ),
        })
        setCmdkOpen(false)
        return
      }

      const result = await migrateTableFilePaths(currentNode.id)
      if (result && result.migrated > 0) {
        toast({
          title: t(
            "cmdk.migrateTableFilePaths.migrationCompleted",
            "Table Paths Migrated"
          ),
          description: t(
            "cmdk.migrateTableFilePaths.migrationCompletedDesc",
            `Successfully migrated ${result.migrated} file paths in this table.`,
            { count: result.migrated }
          ),
        })
      } else if (result && result.errors > 0) {
        toast({
          title: t(
            "cmdk.migrateTableFilePaths.migrationFailed",
            "Migration Failed"
          ),
          description: t(
            "cmdk.migrateTableFilePaths.migrationFailedDesc",
            "An error occurred during migration."
          ),
          variant: "destructive",
        })
      }
      setCmdkOpen(false)
    } catch (error) {
      console.error("Table file path migration failed:", error)
      toast({
        title: t(
          "cmdk.migrateTableFilePaths.migrationFailed",
          "Migration Failed"
        ),
        description: t(
          "cmdk.migrateTableFilePaths.migrationFailedDesc",
          error instanceof Error
            ? error.message
            : "An unknown error occurred during migration."
        ),
        variant: "destructive",
      })
    } finally {
      setIsMigratingTable(false)
    }
  }

  /**
   * Fix table schema by removing orphan __title columns
   * 修复表格结构，删除孤立的 __title 列
   *
   * This function detects and removes orphan __title columns that don't have
   * corresponding link fields. This can happen when link fields were deleted
   * incorrectly in older versions, causing "duplicate column name" errors
   * when trying to create new link fields.
   */
  const handleFixTableSchema = async () => {
    if (!currentNode || currentNode.type !== "table") return

    setIsFixingSchema(true)
    try {
      const needsFix = await needsTableSchemaFix(currentNode.id)
      if (!needsFix) {
        toast({
          title: t("cmdk.fixTableSchema.noFixNeeded", "No Fix Needed"),
          description: t(
            "cmdk.fixTableSchema.noFixNeededDesc",
            "This table's schema is already correct."
          ),
        })
        setCmdkOpen(false)
        return
      }

      const result = await fixTableSchema(currentNode.id)
      if (result.errors.length > 0) {
        toast({
          title: t("cmdk.fixTableSchema.fixFailed", "Schema Fix Failed"),
          description: t(
            "cmdk.fixTableSchema.fixFailedDesc",
            `Errors occurred: ${result.errors.join(", ")}`
          ),
          variant: "destructive",
        })
      } else if (result.fixed.length > 0) {
        toast({
          title: t("cmdk.fixTableSchema.fixCompleted", "Schema Fixed"),
          description: t(
            "cmdk.fixTableSchema.fixCompletedDesc",
            `Successfully removed ${result.fixed.length} orphan column(s): ${result.fixed.join(", ")}`,
            { count: result.fixed.length, columns: result.fixed.join(", ") }
          ),
        })
      } else {
        toast({
          title: t("cmdk.fixTableSchema.noFixNeeded", "No Fix Needed"),
          description: t(
            "cmdk.fixTableSchema.noFixNeededDesc",
            "No orphan columns were found."
          ),
        })
      }
      setCmdkOpen(false)
    } catch (error) {
      console.error("Table schema fix failed:", error)
      toast({
        title: t("cmdk.fixTableSchema.fixFailed", "Schema Fix Failed"),
        description: t(
          "cmdk.fixTableSchema.fixFailedDesc",
          error instanceof Error
            ? error.message
            : "An unknown error occurred during schema fix."
        ),
        variant: "destructive",
      })
    } finally {
      setIsFixingSchema(false)
    }
  }

  /**
   * Migrate image and file paths in the current document
   * 修复当前文档中的 image 和 file 路径格式
   *
   * This function fixes embedded image and file references within the current document
   * by converting old path formats to the new standardized format. It only processes
   * the currently opened document.
   */
  const handleMigrateCurrentDocPaths = async () => {
    if (!currentNode || currentNode.type !== "doc") return

    setIsMigratingDoc(true)
    try {
      const needsMigration = await needsDocPathMigration(currentNode.id)
      if (!needsMigration) {
        toast({
          title: t(
            "cmdk.migrateDocPaths.noMigrationNeeded",
            "No Migration Needed"
          ),
          description: t(
            "cmdk.migrateDocPaths.noMigrationNeededDesc",
            "This document's file paths are already in the correct format."
          ),
        })
        setCmdkOpen(false)
        return
      }

      const result = await migrateDocFilePaths(currentNode.id)
      if (result && result.migrated > 0) {
        toast({
          title: t(
            "cmdk.migrateDocPaths.migrationCompleted",
            "Document Paths Migrated"
          ),
          description: t(
            "cmdk.migrateDocPaths.migrationCompletedDesc",
            `Successfully migrated ${result.migrated} file paths in this document.`,
            { count: result.migrated }
          ),
        })
      } else if (result && result.errors > 0) {
        toast({
          title: t("cmdk.migrateDocPaths.migrationFailed", "Migration Failed"),
          description: t(
            "cmdk.migrateDocPaths.migrationFailedDesc",
            "An error occurred during migration."
          ),
          variant: "destructive",
        })
      }
      setCmdkOpen(false)
    } catch (error) {
      console.error("Document path migration failed:", error)
      toast({
        title: t("cmdk.migrateDocPaths.migrationFailed", "Migration Failed"),
        description: t(
          "cmdk.migrateDocPaths.migrationFailedDesc",
          error instanceof Error
            ? error.message
            : "An unknown error occurred during migration."
        ),
        variant: "destructive",
      })
    } finally {
      setIsMigratingDoc(false)
    }
  }

  /**
   * Migrate file paths in the eidos__files table
   * 修复 eidos__files 表中的路径格式
   *
   * This function fixes file path records in the system files table (eidos__files).
   * These paths are used by the image picker and file picker components throughout
   * the application. Migrating these paths ensures all file references work correctly.
   */
  const handleMigrateFilePaths = async () => {
    setIsMigrating(true)
    try {
      const needsFileMigration = await needsPathMigration()

      if (!needsFileMigration) {
        toast({
          title: t(
            "cmdk.migrateFilePaths.noMigrationNeeded",
            "No Migration Needed"
          ),
          description: t(
            "cmdk.migrateFilePaths.noMigrationNeededDesc",
            "All file paths are already in the correct format."
          ),
        })
        setCmdkOpen(false)
        return
      }

      let totalMigrated = 0
      let totalErrors = 0

      // Migrate file table records
      if (needsFileMigration) {
        const fileResult = await migrateFilePaths()
        if (fileResult) {
          totalMigrated += fileResult.migrated
          totalErrors += fileResult.errors
        }
      }

      if (totalErrors > 0) {
        toast({
          title: t(
            "cmdk.migrateFilePaths.migrationCompletedWithErrors",
            "Migration Completed with Errors"
          ),
          description: t(
            "cmdk.migrateFilePaths.migrationCompletedWithErrorsDesc",
            `Successfully migrated ${totalMigrated} file paths, but ${totalErrors} items had errors. Check the console for details.`,
            { migrated: totalMigrated, errors: totalErrors }
          ),
          variant: "destructive",
        })
      } else {
        toast({
          title: t(
            "cmdk.migrateFilePaths.migrationCompleted",
            "Migration Completed"
          ),
          description: t(
            "cmdk.migrateFilePaths.migrationCompletedDesc",
            `Successfully migrated ${totalMigrated} file paths.`,
            { count: totalMigrated }
          ),
        })
      }
      setCmdkOpen(false)
    } catch (error) {
      console.error("File path migration failed:", error)
      toast({
        title: t("cmdk.migrateFilePaths.migrationFailed", "Migration Failed"),
        description: t(
          "cmdk.migrateFilePaths.migrationFailedDesc",
          error instanceof Error
            ? error.message
            : "An unknown error occurred during migration.",
          {
            error:
              error instanceof Error
                ? error.message
                : "An unknown error occurred during migration.",
          }
        ),
        variant: "destructive",
      })
    } finally {
      setIsMigrating(false)
    }
  }

  const toggleAI = () => {
    setCmdkOpen(false)
    setIsAiOpen(!isAiOpen)
  }

  const createNewDoc = async () => {
    const docId = await createDoc("")
    goto(`/${docId}`)()
  }

  const handleResetTabs = () => {
    resetTabs()
    toast({
      title: t("cmdk.resetTabs.success", "Tabs Reset"),
      description: t(
        "cmdk.resetTabs.successDesc",
        "Sidebar tabs have been reset to default."
      ),
    })
    setCmdkOpen(false)
  }

  const handleReloadApp = async () => {
    setCmdkOpen(false)
    await window.eidos.reloadApp()
  }

  const handleInstallCli = async () => {
    if (!window.eidos?.cli) return

    setIsInstallingCli(true)
    try {
      const result = await window.eidos.cli.install()
      if (result.success) {
        setIsCliInstalled(true)
        toast({
          title: t("cmdk.cli.installSuccess", "CLI Installed"),
          description: result.message,
        })
      } else {
        toast({
          title: t("cmdk.cli.installFailed", "Installation Failed"),
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: t("cmdk.cli.installFailed", "Installation Failed"),
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsInstallingCli(false)
      setCmdkOpen(false)
    }
  }

  const handleUninstallCli = async () => {
    if (!window.eidos?.cli) return

    try {
      const result = await window.eidos.cli.uninstall()
      if (result.success) {
        setIsCliInstalled(false)
        toast({
          title: t("cmdk.cli.uninstallSuccess", "CLI Uninstalled"),
          description: result.message,
        })
      } else {
        toast({
          title: t("cmdk.cli.uninstallFailed", "Uninstall Failed"),
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: t("cmdk.cli.uninstallFailed", "Uninstall Failed"),
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setCmdkOpen(false)
    }
  }

  const { t } = useTranslation()

  return (
    <CommandDialog open={isCmdkOpen} onOpenChange={setCmdkOpen}>
      {secondaryView ? (
        <SecondaryView
          component={secondaryView.component}
          title={secondaryView.title}
          onBack={() => setSecondaryView(null)}
        />
      ) : (
        <>
          <CommandInput
            placeholder={t("cmdk.inputPlaceholder")}
            value={input}
            onValueChange={setInput}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>
              <span>{t("cmdk.notFound", { input })}</span>
            </CommandEmpty>

            {mode === "search" && (
              <>
                {!isInkServiceMode && (
                  <CommandGroup heading={t("cmdk.suggestions")}>
                    <CommandItem onSelect={goToday} value="today">
                      <Clock3Icon className="mr-2 h-4 w-4" />
                      <span>{t("common.today")}</span>
                    </CommandItem>
                    <CommandItem onSelect={createNewDoc} value="new draft doc">
                      <FilePlus2Icon className="mr-2 h-4 w-4" />
                      <span>{t("cmdk.newDraftDoc")}</span>
                    </CommandItem>
                    <CommandItem onSelect={toggleAI}>
                      <Bot className="mr-2 h-4 w-4" />
                      <span>{t("common.ai")}</span>
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandSeparator />
                {/* Table commands: import schema is always visible; rebuild FTS etc. are table-node only */}
                <CommandGroup heading={t("cmdk.table")}>
                  {/* Import schema: available globally */}
                  <CommandItem
                    value="import table schema recreate from base64"
                    onSelect={() => {
                      setSecondaryView({
                        component: (
                          <ImportSchema
                            onDone={() => {
                              setSecondaryView(null)
                              setCmdkOpen(false)
                            }}
                          />
                        ),
                        title: "Import Table Schema",
                      })
                    }}
                  >
                    <TableIcon className="mr-2 h-4 w-4" />
                    <div className="flex flex-col">
                      <span>Import Table Schema</span>
                      <span className="text-xs text-muted-foreground">
                        Paste a base64 schema to recreate a table
                      </span>
                    </div>
                  </CommandItem>

                  {/* Desktop-only / table-node-specific commands */}
                  {isDesktopMode && currentNode?.type === "table" && (
                    <>
                      <CommandItem
                        onSelect={() => {
                          rebuildTableFTS(currentNode.id)
                        }}
                        value={`${t("cmdk.rebuildFTS")} ${t("cmdk.rebuildFTS.desc")}`}
                      >
                        <RefreshCcwIcon className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span>{t("cmdk.rebuildFTS")}</span>
                          <span className="text-xs text-muted-foreground">
                            {t("cmdk.rebuildFTS.desc")}
                          </span>
                        </div>
                      </CommandItem>
                      <CommandItem
                        onSelect={handleMigrateTableFilePaths}
                        disabled={isMigratingTable}
                        value={`${t("cmdk.migrateTableFilePaths")} ${t("cmdk.migrateTableFilePaths.desc")}`}
                      >
                        {isMigratingTable ? (
                          <RefreshCcwIcon className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Wrench className="mr-2 h-4 w-4" />
                        )}
                        <div className="flex flex-col">
                          <span>{t("cmdk.migrateTableFilePaths")}</span>
                          <span className="text-xs text-muted-foreground">
                            {t("cmdk.migrateTableFilePaths.desc")}
                          </span>
                        </div>
                      </CommandItem>
                      <CommandItem
                        onSelect={handleFixTableSchema}
                        disabled={isFixingSchema}
                        value={`${t("cmdk.fixTableSchema")} ${t("cmdk.fixTableSchema.desc")}`}
                      >
                        {isFixingSchema ? (
                          <RefreshCcwIcon className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="mr-2 h-4 w-4" />
                        )}
                        <div className="flex flex-col">
                          <span>{t("cmdk.fixTableSchema")}</span>
                          <span className="text-xs text-muted-foreground">
                            {t("cmdk.fixTableSchema.desc")}
                          </span>
                        </div>
                      </CommandItem>
                    </>
                  )}
                </CommandGroup>

                {currentNode?.type === "doc" && (
                  <>
                    <CommandGroup heading={t("cmdk.document")}>
                      <CommandItem
                        onSelect={handleMigrateCurrentDocPaths}
                        disabled={isMigratingDoc}
                        value={`${t("cmdk.migrateDocPaths")} ${t("cmdk.migrateDocPaths.desc")}`}
                      >
                        {isMigratingDoc ? (
                          <RefreshCcwIcon className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Wrench className="mr-2 h-4 w-4" />
                        )}
                        <div className="flex flex-col">
                          <span>{t("cmdk.migrateDocPaths")}</span>
                          <span className="text-xs text-muted-foreground">
                            {t("cmdk.migrateDocPaths.desc")}
                          </span>
                        </div>
                      </CommandItem>
                    </CommandGroup>
                    <DocActionCommandItems />
                  </>
                )}
              </>
            )}

            <CommandSeparator />
            <CommandGroup heading={t("common.settings")}>
              <CommandItem onSelect={switchTheme}>
                <Palette className="mr-2 h-4 w-4" />
                <span>{t("cmdk.switchTheme")}</span>
                <CommandShortcut>⌘+Shift+L</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={handleReloadApp}>
                <RefreshCcwIcon className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span>{t("cmdk.reload")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("cmdk.reload.desc")}
                  </span>
                </div>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setSecondaryView({
                    component: <ThemeStudio />,
                    title: t("cmdk.themeStudio"),
                  })
                }}
              >
                <PaintBucket className="mr-2 h-4 w-4" />
                <span>{t("cmdk.themeStudio")}</span>
              </CommandItem>
              <CommandItem
                onSelect={handleMigrateFilePaths}
                disabled={isMigrating}
                value="migrate file paths"
              >
                {isMigrating ? (
                  <RefreshCcwIcon className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wrench className="mr-2 h-4 w-4" />
                )}
                <div className="flex flex-col">
                  <span>{t("cmdk.migrateFilePaths")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("cmdk.migrateFilePaths.desc")}
                  </span>
                </div>
              </CommandItem>
              <CommandItem
                onSelect={handleResetTabs}
                value="reset sidebar tabs"
              >
                <LayoutGrid className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span>{t("cmdk.resetTabs", "Reset Sidebar Tabs")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("cmdk.resetTabs.desc", "Reset sidebar tabs to default")}
                  </span>
                </div>
              </CommandItem>
              {!isInkServiceMode && (
                <CommandItem
                  onSelect={() => {
                    setKeyboardShortcutsOpen(!isKeyboardShortcutsOpen)
                    setCmdkOpen(false)
                  }}
                >
                  <Keyboard className="mr-2 h-4 w-4" />
                  <span>
                    {t(
                      "nav.dropdown.menu.keyboardShortcuts",
                      "Keyboard Shortcuts"
                    )}
                  </span>
                </CommandItem>
              )}
              <CommandItem onSelect={() => openSettingsModal("general")}>
                <Settings className="mr-2 h-4 w-4" />
                <span>{t("common.settings")}</span>
              </CommandItem>
              {isDesktopMode && isCliInstalled !== null && (
                <CommandItem
                  onSelect={
                    isCliInstalled ? handleUninstallCli : handleInstallCli
                  }
                  disabled={isInstallingCli}
                  value="install eidos cli command path"
                >
                  {isInstallingCli ? (
                    <RefreshCcwIcon className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Terminal className="mr-2 h-4 w-4" />
                  )}
                  <div className="flex flex-col">
                    <span>
                      {isCliInstalled
                        ? t(
                            "cmdk.cli.uninstall",
                            "Uninstall 'eidos' command from PATH"
                          )
                        : t(
                            "cmdk.cli.install",
                            "Install 'eidos' command in PATH"
                          )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {isCliInstalled
                        ? t(
                            "cmdk.cli.uninstallDesc",
                            "Remove the eidos CLI from your system PATH"
                          )
                        : t(
                            "cmdk.cli.installDesc",
                            "Use 'eidos' command in terminal to interact with Eidos"
                          )}
                    </span>
                  </div>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </>
      )}
    </CommandDialog>
  )
}
