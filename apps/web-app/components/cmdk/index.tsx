"use client"

import { useEffect, useState } from "react"
import { useDebounceFn, useKeyPress } from "ahooks"
import {
  Bot,
  Clock3Icon,
  FilePlus2Icon,
  PaintBucket,
  Palette,
  RefreshCcwIcon,
  Settings,
  Wand2,
  Wrench,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

import { isDesktopMode, isInkServiceMode } from "@/lib/env"
import { useToast } from "@/components/ui/use-toast"
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
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useQueryNode } from "@/apps/web-app/hooks/use-query-node"
import { useSettings } from "@/apps/web-app/hooks/use-settings"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useLastOpened } from "@/apps/web-app/pages/[database]/hook"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { ThemeStudio } from "../theme-studio"
import { DocActionCommandItems } from "./doc-actions"
// import { ExtensionCommandItems } from "./extension"
import { useCMDKGoto, useCMDKStore, useInput } from "./hooks"
import { NodeCommandItems } from "./nodes"
import { SecondaryView } from "./secondary-view"
import { SpaceCommandItems } from "./spaces"

type SecondaryView = {
  component: React.ReactNode
  title: string
} | null

export function CommandDialogDemo() {
  const { isCmdkOpen, setCmdkOpen, isGodMode, setGodMode } =
    useAppRuntimeStore()
  const { openSettingsModal } = useSettings()
  const { input, setInput, mode } = useInput()
  const { queryNodes, fullTextSearch } = useQueryNode()
  const { theme, setTheme } = useTheme()
  const { space } = useCurrentPathInfo()
  const { setSearchNodes } = useCMDKStore()
  const [secondaryView, setSecondaryView] = useState<SecondaryView>(null)

  const currentNode = useCurrentNode()

  useKeyPress(["ctrl.k", "meta.k"], (e) => {
    e.preventDefault()
    setCmdkOpen(!isCmdkOpen)
  })

  const updateSearchNodes = async (qs: string) => {
    if (mode !== "search") {
      return
    }
    if (qs.length > 0) {
      const nodes = await queryNodes(qs)
      const ftsNodes = await fullTextSearch(qs)
      setSearchNodes([...(ftsNodes || []), ...(nodes || [])])
    }
  }
  const { run } = useDebounceFn(updateSearchNodes, { wait: 500 })

  useEffect(() => {
    space && run(input)
  }, [input, run, space])

  const { isRightPanelOpen: isAiOpen, setIsRightPanelOpen: setIsAiOpen } =
    useSpaceAppStore()
  const { lastOpenedDatabase } = useLastOpened()

  const { createDoc, rebuildFTS, migrateFilePaths, needsPathMigration, migrateDocFilePaths, migrateAllDocFilePaths, needsDocPathMigration, migrateTableFilePaths, needsTableFilePathMigration } = useSqlite()
  const goto = useCMDKGoto()
  const [isMigrating, setIsMigrating] = useState(false)
  const [isMigratingDoc, setIsMigratingDoc] = useState(false)
  const [isMigratingTable, setIsMigratingTable] = useState(false)
  const { toast } = useToast()
  
  // Use current workspace in desktop mode, otherwise use lastOpenedDatabase
  const goEveryday = goto(`/journals`)

  const today = getToday()
  const goToday = goto(`/journals/${today}`)
  const goShare = goto("/share")

  const switchTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light"
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

  const handleMigrateTableFilePaths = async () => {
    if (!currentNode || currentNode.type !== "table") return
    
    setIsMigratingTable(true)
    try {
      const needsMigration = await needsTableFilePathMigration(currentNode.id)
      if (!needsMigration) {
        toast({
          title: t("cmdk.migrateTableFilePaths.noMigrationNeeded", "No Migration Needed"),
          description: t("cmdk.migrateTableFilePaths.noMigrationNeededDesc", "This table's file paths are already in the correct format."),
        })
        setCmdkOpen(false)
        return
      }
      
      const result = await migrateTableFilePaths(currentNode.id)
      if (result && result.migrated > 0) {
        toast({
          title: t("cmdk.migrateTableFilePaths.migrationCompleted", "Table Paths Migrated"),
          description: t("cmdk.migrateTableFilePaths.migrationCompletedDesc", 
            `Successfully migrated ${result.migrated} file paths in this table.`, { count: result.migrated }),
        })
      } else if (result && result.errors > 0) {
        toast({
          title: t("cmdk.migrateTableFilePaths.migrationFailed", "Migration Failed"),
          description: t("cmdk.migrateTableFilePaths.migrationFailedDesc", "An error occurred during migration."),
          variant: "destructive",
        })
      }
      setCmdkOpen(false)
    } catch (error) {
      console.error("Table file path migration failed:", error)
      toast({
        title: t("cmdk.migrateTableFilePaths.migrationFailed", "Migration Failed"),
        description: t("cmdk.migrateTableFilePaths.migrationFailedDesc", 
          error instanceof Error ? error.message : "An unknown error occurred during migration."),
        variant: "destructive",
      })
    } finally {
      setIsMigratingTable(false)
    }
  }

  const handleMigrateCurrentDocPaths = async () => {
    if (!currentNode || currentNode.type !== "doc") return
    
    setIsMigratingDoc(true)
    try {
      const needsMigration = await needsDocPathMigration(currentNode.id)
      if (!needsMigration) {
        toast({
          title: t("cmdk.migrateDocPaths.noMigrationNeeded", "No Migration Needed"),
          description: t("cmdk.migrateDocPaths.noMigrationNeededDesc", "This document's file paths are already in the correct format."),
        })
        setCmdkOpen(false)
        return
      }
      
      const result = await migrateDocFilePaths(currentNode.id)
      if (result && result.migrated > 0) {
        toast({
          title: t("cmdk.migrateDocPaths.migrationCompleted", "Document Paths Migrated"),
          description: t("cmdk.migrateDocPaths.migrationCompletedDesc", 
            `Successfully migrated ${result.migrated} file paths in this document.`, { count: result.migrated }),
        })
      } else if (result && result.errors > 0) {
        toast({
          title: t("cmdk.migrateDocPaths.migrationFailed", "Migration Failed"),
          description: t("cmdk.migrateDocPaths.migrationFailedDesc", "An error occurred during migration."),
          variant: "destructive",
        })
      }
      setCmdkOpen(false)
    } catch (error) {
      console.error("Document path migration failed:", error)
      toast({
        title: t("cmdk.migrateDocPaths.migrationFailed", "Migration Failed"),
        description: t("cmdk.migrateDocPaths.migrationFailedDesc", 
          error instanceof Error ? error.message : "An unknown error occurred during migration."),
        variant: "destructive",
      })
    } finally {
      setIsMigratingDoc(false)
    }
  }

  const handleMigrateFilePaths = async () => {
    setIsMigrating(true)
    try {
      const needsFileMigration = await needsPathMigration()
      const needsDocMigration = await needsDocPathMigration()
      
      if (!needsFileMigration && !needsDocMigration) {
        toast({
          title: t("cmdk.migrateFilePaths.noMigrationNeeded", "No Migration Needed"),
          description: t("cmdk.migrateFilePaths.noMigrationNeededDesc", "All file paths are already in the correct format."),
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
      
      // Migrate document content
      if (needsDocMigration) {
        const docResult = await migrateAllDocFilePaths()
        if (docResult) {
          totalMigrated += docResult.migrated
          totalErrors += docResult.errors
        }
      }
      
      if (totalErrors > 0) {
        toast({
          title: t("cmdk.migrateFilePaths.migrationCompletedWithErrors", "Migration Completed with Errors"),
          description: t("cmdk.migrateFilePaths.migrationCompletedWithErrorsDesc", 
            `Successfully migrated ${totalMigrated} file paths, but ${totalErrors} items had errors. Check the console for details.`, 
            { migrated: totalMigrated, errors: totalErrors }),
          variant: "destructive",
        })
      } else {
        toast({
          title: t("cmdk.migrateFilePaths.migrationCompleted", "Migration Completed"),
          description: t("cmdk.migrateFilePaths.migrationCompletedDesc", 
            `Successfully migrated ${totalMigrated} file paths.`, { count: totalMigrated }),
        })
      }
      setCmdkOpen(false)
    } catch (error) {
      console.error("File path migration failed:", error)
      toast({
        title: t("cmdk.migrateFilePaths.migrationFailed", "Migration Failed"),
        description: t("cmdk.migrateFilePaths.migrationFailedDesc", 
          error instanceof Error ? error.message : "An unknown error occurred during migration.", 
          { error: error instanceof Error ? error.message : "An unknown error occurred during migration." }),
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
                {isDesktopMode && currentNode?.type === "table" && (
                  <CommandGroup heading={t("cmdk.table")}>
                    <CommandItem
                      onSelect={() => {
                        rebuildTableFTS(currentNode.id)
                      }}
                      value="rebuild fts"
                    >
                      <RefreshCcwIcon className="mr-2 h-4 w-4" />
                      <span>{t("cmdk.rebuildFTS")}</span>
                    </CommandItem>
                    <CommandItem
                      onSelect={handleMigrateTableFilePaths}
                      disabled={isMigratingTable}
                      value="migrate table file paths"
                    >
                      {isMigratingTable ? (
                        <RefreshCcwIcon className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wrench className="mr-2 h-4 w-4" />
                      )}
                      <span>{t("cmdk.migrateTableFilePaths", "Fix File Paths (Current Table)")}</span>
                    </CommandItem>
                  </CommandGroup>
                )}

                {currentNode?.type === "doc" && (
                  <>
                    <CommandGroup heading={t("cmdk.document", "Document")}>
                      <CommandItem
                        onSelect={handleMigrateCurrentDocPaths}
                        disabled={isMigratingDoc}
                        value="migrate current doc file paths"
                      >
                        {isMigratingDoc ? (
                          <RefreshCcwIcon className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Wrench className="mr-2 h-4 w-4" />
                        )}
                        <span>{t("cmdk.migrateDocPaths", "Fix File Paths (Current Doc)")}</span>
                      </CommandItem>
                    </CommandGroup>
                    <DocActionCommandItems />
                  </>
                )}
                {!isInkServiceMode && (
                  <>
                    <NodeCommandItems />
                    <SpaceCommandItems />
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
              <CommandItem onSelect={toggleGodMode}>
                <Wand2 className="mr-2 h-4 w-4" />
                <span>
                  {isGodMode
                    ? t("cmdk.disableGodMode", "Disable Creator Mode")
                    : t("cmdk.enableGodMode", "Enable Creator Mode")}
                </span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setSecondaryView({
                    component: <ThemeStudio />,
                    title: t("cmdk.themeStudio", "Theme Studio"),
                  })
                }}
              >
                <PaintBucket className="mr-2 h-4 w-4" />
                <span>{t("cmdk.themeStudio", "Theme Studio")}</span>
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
                <span>{t("cmdk.migrateFilePaths", "Fix File Paths")}</span>
              </CommandItem>
              {!isInkServiceMode && (
                <CommandItem onSelect={() => openSettingsModal("general")}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>{t("common.settings")}</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </>
      )}
    </CommandDialog>
  )
}
