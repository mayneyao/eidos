import { useCallback, useRef, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { useMount } from "ahooks"
import { BlendIcon, ChevronDownIcon, Copy, LayoutDashboard } from "lucide-react"
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
import { usePlayground } from "@/apps/desktop/hooks"

// 添加这个 import

import { useRemixPrompt } from "../hooks/use-remix-prompt"
import { useScript } from "../hooks/use-script"
import { useEditorStore } from "../stores/editor-store"

export const ExtensionToolbar = () => {
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
          title: "Code Updated Successfully",
        })
      }
    },
    [revalidator, script, toast, updateScript]
  )

  const { space } = useCurrentPathInfo()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const { layoutMode, setLayoutMode } = useEditorStore()

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
      title: "Code copied to clipboard",
      duration: 2000,
    })
  }, [script.ts_code, script.code, toast])

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
            Delete
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Script</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{script.name}"? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteScript}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="outline" size="xs" onClick={handleCopyCode}>
        <Copy className="mr-2 h-4 w-4" />
        Copy
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="xs">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Layout
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setLayoutMode("full")}>
            Full View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLayoutMode("chat-preview")}>
            Chat + Preview
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLayoutMode("chat-code")}>
            Chat + Code
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLayoutMode("code-preview")}>
            Code + Preview
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
          Edit in Cursor
          {!isDesktopMode && <Badge variant="secondary">Desktop Only</Badge>}
        </Button>
      )}
      {/* <Button type="submit" onClick={manualSave} size="xs">
        Update
      </Button> */}
    </div>
  )
}
