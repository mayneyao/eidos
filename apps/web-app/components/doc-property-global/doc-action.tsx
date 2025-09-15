import React, { useEffect, useState } from "react"
import type {
  DocActionMeta,
  IExtension,
} from "@/packages/core/types/IExtension"
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/use-toast"
import { useScriptFunction } from "@/components/script-container/hook"
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useExtensionNavigateById } from "@/apps/web-app/hooks/use-extension-navigate"
import { useNewExtension } from "@/apps/web-app/pages/[database]/extensions/hooks/use-new-extension"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useGenerateTitle } from "@/apps/web-app/pages/[database]/[node]/hooks/use-generate-title"

import { IconRenderer } from "../ui/icon-picker"

interface DocActionProps {
  docId: string
}

export const DocAction: React.FC<DocActionProps> = ({ docId }) => {
  const { t } = useTranslation()
  const params = useCurrentPathInfo()
  const { updateNodeName, getDocMarkdown } = useSqlite(params.database)
  const { generateTitle, isLoading: isTitleGenerating } = useGenerateTitle()
  const { callFunction } = useScriptFunction()
  const node = useCurrentNode()
  const { sqlite } = useSqlite()
  const navigateToExtension = useExtensionNavigateById()
  const { handleCreateNewExtension } = useNewExtension()
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
    if (!docId) return

    const docContent = await getDocMarkdown(docId)
    if (!docContent) return

    try {
      const newTitle = await generateTitle(docContent)
      console.log("newTitle", newTitle)
      if (newTitle) {
        await updateNodeName(docId, newTitle)
      }
    } catch (error) {
      console.error("Failed to generate title:", error)
      toast({
        title: t("common.error"),
        description: t("common.error.tryAgainLater"),
      })
    }
  }

  const handleDocActionScript = async (script: IExtension<DocActionMeta>) => {
    if (!docId || !params.database) return

    setIsScriptRunning(true)
    try {
      await callFunction({
        input: {},
        command: script.meta!.funcName,
        context: {
          docId,
          databaseId: params.database,
        },
        code: script.code,
        id: script.id,
        space: params.database,
      })
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
    e.stopPropagation() // 阻止事件冒泡到 DropdownMenuItem
    navigateToExtension(scriptId)
  }

  const handleCreateNewDocAction = async () => {
    try {
      await handleCreateNewExtension("docAction")
    } catch (error) {
      console.error("Failed to create new doc action:", error)
      toast({
        title: t("common.error"),
        description: t("common.error.tryAgainLater"),
        variant: "destructive",
      })
    }
  }

  return (
    <div className="flex items-center gap-2 select-none">
      {!isReadOnly && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className={`h-8 px-2 text-xs relative overflow-hidden ${
                  isAnyActionRunning
                    ? "animate-pulse before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:animate-[ripple_2s_ease-in-out_infinite]"
                    : ""
                }`}
                disabled={isAnyActionRunning}
              >
                {isAnyActionRunning ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5 mr-1" />
                )}
                {t("doc.actions")}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="flex items-center gap-1">
                Document Actions
                <a
                  href="https://docs.eidos.space/nodes/doc/#custom-actions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <BookOpen className="w-3 h-3" />
                </a>
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={handleGenerateTitle}
                disabled={isTitleGenerating}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                {t("doc.generateTitle")}
                <Badge variant="secondary" className="ml-auto text-xs">
                  {t("common.builtIn")}
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {docActionScripts.length > 0 ? (
                docActionScripts.map((script) => (
                  <DropdownMenuItem
                    key={script.id}
                    onClick={() => handleDocActionScript(script)}
                    disabled={isAnyActionRunning}
                    className="group relative"
                  >
                    <IconRenderer
                      name={(script.icon as any) || "zap"}
                      className="h-3.5 w-3.5 mr-1"
                    />
                    <span className="flex-1">{script.meta!.docAction.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 ml-2"
                      onClick={(e) => handleExtensionBadgeClick(e, script.id)}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem
                  onClick={handleCreateNewDocAction}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  <span>{t("doc.actions.createNew")}</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  )
}

export default DocAction
