import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { useMount } from "ahooks"
import { useTheme } from "next-themes"
import {
  useLoaderData,
  useRevalidator,
  useSearchParams,
} from "react-router-dom"

import { cn } from "@/lib/utils"
import { compileCode } from "@/lib/v3/compiler"
import { compileLexicalCode } from "@/lib/v3/lexical-compiler"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { BlockRenderer } from "@/components/block-renderer/block-renderer"
import { DocEditorPlayground } from "@/components/doc-editor-playground"

import { Chat } from "../../../../components/remix-chat/chat"
import { ExtensionToolbar } from "./components/extension-toolbar"
import { ExtensionConfig } from "./config/config"
import { ScriptSandbox } from "./editor/script-sandbox"
import { getEditorLanguage } from "./helper"
import { useExtensionChatHistory } from "./hooks/use-extension-chat-history"
import { useScript } from "./hooks/use-script"
import { useEditorStore } from "./stores/editor-store"

const CodeEditor = lazy(() => import("./editor/code-editor"))

export const ScriptDetailPage = () => {
  const script = useLoaderData() as IScript
  const { updateScript } = useScript()
  const editorRef = useRef<{ save: () => void; layout: () => void }>(null)
  const revalidator = useRevalidator()
  const language = getEditorLanguage(script)
  const [editorContent, setEditorContent] = useState(
    script.ts_code || script.code
  )

  const { layoutMode, scriptCodeMap } = useEditorStore()

  const currentDraftCode = scriptCodeMap["current"]

  const [currentCompiledDraftCode, setCurrentCompiledDraftCode] = useState(
    script.code
  )

  useEffect(() => {
    if (currentDraftCode) {
      const compileMethod =
        script.type === "doc_plugin" ? compileLexicalCode : compileCode
      compileMethod(currentDraftCode).then((result) => {
        setCurrentCompiledDraftCode(result.code)
      })
    } else {
      setCurrentCompiledDraftCode(script.code)
    }
  }, [currentDraftCode])

  const showPreview =
    (layoutMode === "full" || layoutMode.includes("preview")) &&
    (script.type === "m_block" || script.type === "doc_plugin")
  const showCode = layoutMode === "full" || layoutMode.includes("code")
  const showChat =
    (layoutMode === "full" || layoutMode.includes("chat")) &&
    script.type !== "prompt" &&
    script.type !== "udf"

  useEffect(() => {
    setCurrentCompiledDraftCode(script.code)
  }, [script.code])

  useEffect(() => {
    setEditorContent(script.ts_code || script.code)
  }, [script.ts_code, script.code])

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
      if (script.type === "script") {
        const sandbox = new ScriptSandbox()
        try {
          const exportsCommands = await sandbox.extractExports(code)
          if (exportsCommands) {
            await updateScript({
              id: script.id,
              commands: exportsCommands,
            })
          }
        } finally {
          sandbox.destroy()
        }
      }
    },
    [revalidator, script, toast, updateScript]
  )
  const { theme } = useTheme()

  const manualSave = () => {
    editorRef.current?.save()
  }

  useEffect(() => {
    editorRef.current?.layout()
  }, [layoutMode])

  const blockCodeCompile = async (ts_code: string) => {
    const result = await compileCode(ts_code)
    return result.code
  }
  const lexicalCodeCompile = async (ts_code: string) => {
    const result = await compileLexicalCode(ts_code)
    return result.code
  }

  const compile = async () => {
    const ts_code = script.ts_code
    if (ts_code) {
      const result = await compileCode(ts_code)
      console.log("result", result)
      onSubmit(result.code, ts_code)
    }
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get("tab") || "basic"

  const { chatHistory, chatId } = useExtensionChatHistory(script.id)

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        setSearchParams({ tab: value })
      }}
      className="flex h-full w-full flex-col overflow-hidden p-2 px-4 pt-0"
    >
      <TabsList className="flex w-full border-b justify-between">
        <div>
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </div>
        {activeTab === "basic" && <ExtensionToolbar />}
      </TabsList>

      {revalidator.state === "loading" ? (
        <Skeleton className="mt-8 h-[20px] w-[100px] rounded-full" />
      ) : (
        <>
          <TabsContent
            value="basic"
            className="data-[state=inactive]:hidden h-full w-full flex flex-col grow min-h-0"
          >
            <div className="flex h-full flex-col gap-4">
              <div role="content" className="grow overflow-hidden min-h-0">
                <div className={cn("flex gap-4 h-full")}>
                  {showChat && (
                    <div className="flex-1 h-full overflow-y-auto border-r">
                      <Chat
                        id={chatId}
                        scriptId={script.id}
                        initialMessages={chatHistory}
                        selectedModelId={""}
                      />
                    </div>
                  )}
                  {showCode && (
                    <div className="flex-1 h-full">
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
                          bindings={script.bindings}
                          scriptId={script.id}
                          theme={theme === "dark" ? "vs-dark" : "light"}
                          customCompile={
                            script.type === "m_block"
                              ? blockCodeCompile
                              : script.type === "doc_plugin"
                              ? lexicalCodeCompile
                              : undefined
                          }
                        />
                      </Suspense>
                    </div>
                  )}

                  {showPreview && (
                    <div className="flex-1 h-full">
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
                        <div className="h-full">
                          {script.type === "doc_plugin" && (
                            <DocEditorPlayground
                              code={currentCompiledDraftCode || script.code}
                            />
                          )}
                          {script.type === "m_block" && (
                            <BlockRenderer
                              code={script.ts_code || ""}
                              compiledCode={
                                currentCompiledDraftCode || script.code || ""
                              }
                              env={script.env_map}
                              bindings={script.bindings}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent
            value="settings"
            className="data-[state=inactive]:hidden h-full w-full overflow-y-auto"
          >
            <ExtensionConfig />
          </TabsContent>
        </>
      )}
    </Tabs>
  )
}
