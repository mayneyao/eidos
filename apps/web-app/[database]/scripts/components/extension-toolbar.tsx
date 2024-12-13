import { useCallback, useRef, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { useMount } from "ahooks"
import { BlendIcon, Copy, LayoutDashboard } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLoaderData, useNavigate, useRevalidator } from "react-router-dom"

import { isDesktopMode } from "@/lib/env"
import { compileCode } from "@/lib/v3/compiler"
import { openCursor } from "@/lib/web/schema"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { usePlayground } from "@/apps/desktop/hooks/usePlayground"

import { useRemixPrompt } from "../hooks/use-remix-prompt"
import { useScript } from "../hooks/use-script"
import { useEditorStore } from "../stores/editor-store"

export const ExtensionToolbar = () => {
  const { t } = useTranslation()
  const script = useLoaderData() as IScript
  const { deleteScript, updateScript } = useScript()
  const router = useNavigate()
  const editorRef = useRef<{ save: () => void; layout: () => void }>(null)
  const revalidator = useRevalidator()

  useMount(() => {
    revalidator.revalidate()
  })

  const { toast } = useToast()
  const onSubmit = useCallback(
    async (code: string, ts_code?: string) => {
      if (code !== script.code || ts_code !== script.ts_code) {
        await updateScript({
          id: script.id,
          code,
          ts_code,
        })
        revalidator.revalidate()
        toast({
          title: t("extension.toolbar.codeUpdated"),
        })
      }
    },
    [revalidator, script, toast, updateScript, t]
  )

  const { space } = useCurrentPathInfo()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const { layoutMode, setLayoutMode } = useEditorStore()

  const disableChatLayout = script.type == "udf" || script.type == "prompt"

  const handleDeleteScript = async () => {
    await deleteScript(script.id)
    setShowDeleteDialog(false)
    router(`/${space}/extensions`)
  }

  const manualSave = () => {
    editorRef.current?.save()
  }

  const blockCodeCompile = async (ts_code: string) => {
    const result = await compileCode(ts_code)
    return result.code
  }

  const handleCopyCode = useCallback(() => {
    const codeToCopy = script.ts_code || script.code
    navigator.clipboard.writeText(codeToCopy)
    toast({
      title: t("extension.toolbar.codeCopied"),
      duration: 2000,
    })
  }, [script.ts_code, script.code, toast, t])

  const { initializePlayground } = usePlayground({
    onChange: (filename, content, spaceName, blockId) => {
      if (spaceName !== space || blockId !== script.id) {
        return
      }
      if (filename === "index.jsx") {
        blockCodeCompile(content).then((code) => {
          onSubmit(code, content)
        })
      }
    },
  })
  const { getRemixPrompt } = useRemixPrompt()

  const { isRemixMode, setIsRemixMode } = useEditorStore()

  const handleRemixCode = useCallback(() => {
    setIsRemixMode(!isRemixMode)
  }, [isRemixMode, setIsRemixMode])

  const handleOpenInCursor = useCallback(async () => {
    const remixPrompt = await getRemixPrompt(script.bindings)
    initializePlayground(space, script.id, [
      {
        name: "index.jsx",
        content: script.ts_code || script.code,
      },
      {
        name: ".cursorrules",
        content: remixPrompt,
      },
    ]).then((path) => {
      if (!path) {
        return
      }
      const url = openCursor(path)
      window.open(url, "_blank")
    })
  }, [
    space,
    script.id,
    script.bindings,
    script.ts_code,
    script.code,
    getRemixPrompt,
    initializePlayground,
  ])

  return (
    <div className="flex items-center gap-2">
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="xs">
            {t("extension.toolbar.delete")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("extension.toolbar.deleteConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("extension.toolbar.deleteConfirmDescription", {
                name: script.name,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteScript}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="outline" size="xs" onClick={handleCopyCode}>
        <Copy className="mr-2 h-4 w-4" />
        {t("extension.toolbar.copy")}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="xs">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            {t("extension.toolbar.layout")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() => setLayoutMode("full")}
            disabled={disableChatLayout}
          >
            {t("extension.toolbar.layoutFull")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setLayoutMode("chat-preview")}
            disabled={disableChatLayout}
          >
            {t("extension.toolbar.layoutChatPreview")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setLayoutMode("chat-code")}
            disabled={disableChatLayout}
          >
            {t("extension.toolbar.layoutChatCode")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLayoutMode("code-preview")}>
            {t("extension.toolbar.layoutCodePreview")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {script.type === "m_block" && (
        <Button
          size="xs"
          onClick={handleOpenInCursor}
          disabled={!isDesktopMode}
        >
          <BlendIcon className="mr-2 h-4 w-4" />
          {t("extension.toolbar.editInCursor")}
          {!isDesktopMode && (
            <Badge variant="secondary">
              {t("extension.toolbar.desktopOnly")}
            </Badge>
          )}
        </Button>
      )}
    </div>
  )
}
