import React, { useEffect, useState } from "react"
import type {
  DocActionMeta,
  IExtension,
} from "@/packages/core/types/IExtension"
import { BookOpen, ExternalLink, Loader2, Sparkles, Zap } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { useScriptFunction } from "@/components/script-container/hook"
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useExtensionNavigateById } from "@/apps/web-app/hooks/use-extension-navigate"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useGenerateTitle } from "@/apps/web-app/pages/[database]/[node]/hooks/use-generate-title"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { CommandGroup, CommandItem, CommandSeparator } from "../ui/command"
import { IconRenderer } from "../ui/icon-picker"

export const DocActionCommandItems = () => {
  const { t } = useTranslation()
  const params = useCurrentPathInfo()
  const { updateNodeName, getDocMarkdown } = useSqlite(params.database)
  const { generateTitle, isLoading: isTitleGenerating } = useGenerateTitle()
  const { callFunction } = useScriptFunction()
  const node = useCurrentNode()
  const { sqlite } = useSqlite()
  const navigateToExtension = useExtensionNavigateById()
  const { setCmdkOpen } = useAppRuntimeStore()
  const [docActionScripts, setDocActionScripts] = useState<
    IExtension<DocActionMeta>[]
  >([])
  const [isScriptRunning, setIsScriptRunning] = useState(false)

  useEffect(() => {
    if (!sqlite) return
    const fetchDocActionScripts = async () => {
      try {
        const scripts = await sqlite.extension.getDocActionExtensions("enabled")
        setDocActionScripts(scripts as IExtension<DocActionMeta>[])
      } catch (error) {
        console.error("Failed to fetch doc action scripts:", error)
        setDocActionScripts([])
      }
    }
    fetchDocActionScripts()
  }, [sqlite])

  const isReadOnly = node?.is_locked || false
  const isAnyActionRunning = isTitleGenerating || isScriptRunning

  const handleGenerateTitle = async () => {
    if (!node?.id) return

    const docContent = await getDocMarkdown(node.id)
    if (!docContent) return

    try {
      const newTitle = await generateTitle(docContent)
      if (newTitle) {
        await updateNodeName(node.id, newTitle)
        setCmdkOpen(false)
      }
    } catch (error) {
      console.error("Failed to generate title:", error)
      toast({
        title: t("common.error"),
        description: t("common.error.tryAgainLater"),
        variant: "destructive",
      })
    }
  }

  const handleDocActionScript = async (script: IExtension<DocActionMeta>) => {
    if (!node?.id || !params.database) return

    setIsScriptRunning(true)
    try {
      await callFunction({
        input: {},
        command: script.meta!.funcName,
        context: {
          docId: node.id,
          databaseId: params.database,
        },
        code: script.code,
        id: script.id,
        space: params.database,
      })
      setCmdkOpen(false)
    } catch (error) {
      console.error("Failed to execute doc action script:", error)
      toast({
        title: t("common.error"),
        description:
          error instanceof Error
            ? error.message
            : t("common.error.tryAgainLater"),
        variant: "destructive",
      })
    } finally {
      setIsScriptRunning(false)
    }
  }

  const handleExtensionBadgeClick = (e: React.MouseEvent, scriptId: string) => {
    e.stopPropagation()
    navigateToExtension(scriptId)
    setCmdkOpen(false)
  }

  return (
    <>
      {!isReadOnly && (
        <>
          <CommandGroup heading={t("doc.actions")}>
            <CommandItem
              onSelect={handleGenerateTitle}
              disabled={isTitleGenerating}
              value="generate title"
            >
              {isTitleGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              <span>{t("doc.generateTitle")}</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                {t("common.builtIn")}
              </Badge>
            </CommandItem>
            {docActionScripts.map((script) => (
              <CommandItem
                key={script.id}
                onSelect={() => handleDocActionScript(script)}
                disabled={isAnyActionRunning}
                value={script.meta!.docAction.name}
                className="group relative"
              >
                {isScriptRunning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <IconRenderer
                    name={(script.icon as any) || "zap"}
                    className="mr-2 h-4 w-4"
                  />
                )}
                <span className="flex-1">{script.meta!.docAction.name}</span>
                {/* <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 ml-2 flex items-center justify-center"
                  onClick={(e) => handleExtensionBadgeClick(e, script.id)}
                >
                  <ExternalLink className="h-3 w-3" />
                </button> */}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
        </>
      )}
    </>
  )
}
