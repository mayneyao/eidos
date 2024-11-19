import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { useMount } from "ahooks"
import { BlendIcon, Copy } from "lucide-react"
import { useTheme } from "next-themes"
import {
  useLoaderData,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router-dom"

import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
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
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { BlockRenderer } from "@/components/block-renderer/block-renderer"
import { usePlayground } from "@/apps/desktop/hooks"

import { ExtensionConfig } from "./config/config"
import { getEditorLanguage } from "./helper"
import { useEditableElement } from "./hooks/use-editable-element"
import { useRemixPrompt } from "./hooks/use-remix-prompt"
import { useScript } from "./hooks/use-script"

const CodeEditor = lazy(() => import("./editor/code-editor"))

export const ScriptDetailPage = () => {
  const script = useLoaderData() as IScript
  const { deleteScript, enableScript, disableScript, updateScript } =
    useScript()
  const router = useNavigate()
  const editorRef = useRef<{ save: () => void; layout: () => void }>(null)
  const revalidator = useRevalidator()
  const language = getEditorLanguage(script)
  const [editorContent, setEditorContent] = useState(
    script.ts_code || script.code
  )

  useEffect(() => {
    setEditorContent(script.ts_code || script.code)
  }, [script])

  useMount(() => {
    revalidator.revalidate()
  })

  const { toast } = useToast()
  const onSubmit = useCallback(
    async (code: string, ts_code?: string) => {
      if (code !== script.code || ts_code !== script.ts_code) {
        setEditorContent(ts_code || code)
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
  const { theme } = useTheme()

  const { space } = useCurrentPathInfo()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

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
  const compile = async () => {
    console.log("compile")
    const ts_code = script.ts_code
    if (ts_code) {
      const result = await compileCode(ts_code)
      console.log("result", result)
      onSubmit(result.code, ts_code)
    }
  }

  const handleToggleEnabled = async (id: string, checked: boolean) => {
    if (checked) {
      await enableScript(id)
    } else {
      await disableScript(id)
    }
    revalidator.revalidate()
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get("tab") || "basic"

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

  const handleRemixCode = useCallback(async () => {
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
  }, [space, script.id, initializePlayground])

  const [showPreview, setShowPreview] = useState(true)

  const handlePreviewToggle = useCallback((checked: boolean) => {
    setShowPreview(checked)
    requestAnimationFrame(() => {
      editorRef.current?.layout()
    })
  }, [])

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        setSearchParams({ tab: value })
      }}
      className="flex h-full w-full flex-col overflow-hidden p-2 px-4 pt-0"
    >
      <TabsList className=" w-max">
        <TabsTrigger value="basic">Basic</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      <hr className="my-1" />

      {revalidator.state === "loading" ? (
        <Skeleton className="mt-8 h-[20px] w-[100px] rounded-full" />
      ) : (
        <>
          <TabsContent value="basic" className="h-full w-full">
            <div className="flex h-full flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="mb-1 flex items-end  gap-2 text-xl font-semibold">
                  <span className="max-w-[24rem] truncate" title={script.name}>
                    {script.name}
                  </span>
                  ({script.version})
                  <Switch
                    checked={script.enabled}
                    onCheckedChange={(checked) =>
                      handleToggleEnabled(script.id, checked)
                    }
                  ></Switch>
                </h2>
                <div className="flex items-center gap-2">
                  {script.type === "m_block" && (
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor="preview"
                        className="text-sm text-muted-foreground"
                      >
                        Preview
                      </Label>
                      <Switch
                        id="preview"
                        checked={showPreview}
                        onCheckedChange={handlePreviewToggle}
                      />
                    </div>
                  )}
                  <Dialog
                    open={showDeleteDialog}
                    onOpenChange={setShowDeleteDialog}
                  >
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="xs">
                        Delete
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete Script</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete "{script.name}"? This
                          action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setShowDeleteDialog(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteScript}
                        >
                          Delete
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button variant="outline" size="xs" onClick={handleCopyCode}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>

                  {script.type === "m_block" && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handleRemixCode}
                      disabled={!isDesktopMode}
                    >
                      <BlendIcon className="mr-2 h-4 w-4" />
                      Remix{" "}
                      {!isDesktopMode && (
                        <Badge variant="secondary">Desktop Only</Badge>
                      )}
                    </Button>
                  )}

                  <Button type="submit" onClick={manualSave} size="xs">
                    Update
                  </Button>
                </div>
              </div>
              <p className="w-full truncate" title={script.description}>
                {script.description}
              </p>
              <Separator />
              <div className="mb-2 flex grow flex-col">
                <div
                  className={cn("flex grow", {
                    "gap-4": script.type === "m_block",
                  })}
                >
                  <div
                    className={script.type === "m_block" ? "flex-1" : "w-full"}
                  >
                    <Suspense
                      fallback={
                        <Skeleton className="h-[20px] w-[100px] rounded-full" />
                      }
                    >
                      <CodeEditor
                        ref={editorRef}
                        value={editorContent}
                        onSave={onSubmit}
                        language={language}
                        theme={theme === "dark" ? "vs-dark" : "light"}
                        customCompile={
                          script.type === "m_block"
                            ? blockCodeCompile
                            : undefined
                        }
                      />
                    </Suspense>
                  </div>

                  {script.type === "m_block" && showPreview && (
                    <div className="flex-1">
                      {!script.code ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4">
                          <p className="text-muted-foreground">
                            No preview available. Build first to see the
                            preview.
                          </p>
                          <Button onClick={compile} size="sm">
                            Build
                          </Button>
                        </div>
                      ) : (
                        <BlockRenderer
                          code={script.ts_code || ""}
                          compiledCode={script.code || ""}
                          env={script.env_map}
                          bindings={script.bindings}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="settings" className="h-full overflow-y-auto">
            <ExtensionConfig />
          </TabsContent>
        </>
      )}
    </Tabs>
  )
}
