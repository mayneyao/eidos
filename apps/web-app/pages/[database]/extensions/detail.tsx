import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { parseSync } from "@/packages/v3"
import { extractConstant } from "@/packages/v3/code-tools/code-extractor"
import { compileCode } from "@/packages/v3/compiler"
import { getCompileMethod } from "@/packages/v3/script-compiler"
import { useLocalStorageState, useMount, useSize } from "ahooks"
import { CodeIcon, EyeIcon, SettingsIcon } from "lucide-react"
import { useTheme } from "next-themes"
import {
  useLoaderData,
  useRevalidator,
  useSearchParams,
} from "react-router-dom"

import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { useExtension } from "@/apps/web-app/hooks/use-extension"

import { ExtensionPreview } from "./components/extension-preview"
import { ExtensionToolbar } from "./components/extension-toolbar"
import { ExtensionConfig } from "./config/common-config"
import { getDescriptionFromCode, getEditorLanguage } from "./helper"
import { useEditorStore } from "./stores/editor-store"

// const CodeEditor = lazy(() => import("./editor/code-editor"))
const SimpleCodeEditorWrapper = lazy(
  () => import("./editor/simple-code-editor-wrapper")
)

export const ExtensionDetailPage = () => {
  const script = useLoaderData() as IExtension
  const { updateExtension } = useExtension()
  const editorRef = useRef<{ save: () => void; layout: () => void }>(null)
  const revalidator = useRevalidator()
  const language = getEditorLanguage(script)
  const [editorContent, setEditorContent] = useState(
    script.ts_code || script.code
  )
  const previewRef = useRef<HTMLDivElement>(null)
  const size = useSize(previewRef)

  const [extensionRightPanelSize, setExtensionRightPanelSize] =
    useLocalStorageState<number>("extension-right-panel-size", {
      defaultValue: 30,
    })

  const { scriptCodeMap, setScriptCodeMap } = useEditorStore()

  const currentDraftCode = scriptCodeMap["current"]

  const [currentCompiledDraftCode, setCurrentCompiledDraftCode] = useState(
    script.code
  )

  const shouldShowPreview = script.type === "block"

  const shouldShowCode = true

  useEffect(() => {
    if (currentDraftCode) {
      const compileMethod = compileCode
      compileMethod(currentDraftCode).then((result) => {
        setCurrentCompiledDraftCode(result.code)
      })
    } else {
      setCurrentCompiledDraftCode(script.code)
    }

    return () => {
      setScriptCodeMap("current", "")
    }
  }, [currentDraftCode, setScriptCodeMap])

  const showChat = true
  // script.type !== "py_script"

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
    async (code: string, ts_code?: string, version?: string) => {
      if (
        code !== script.code ||
        ts_code !== script.ts_code ||
        (version && version !== script.version)
      ) {
        setEditorContent(ts_code || code)
        const meta = await extractConstant(ts_code || code, "meta")
        await updateExtension({
          id: script.id,
          code,
          ts_code,
          meta,
          version,
        })
        revalidator.revalidate()
        // toast({
        //   title: "Code Updated Successfully",
        //   description: version
        //     ? `Version updated to ${version}`
        //     : "Content updated.",
        // })
      }
    },
    [revalidator, script, toast, updateExtension]
  )
  const { theme } = useTheme()

  useEffect(() => {
    editorRef.current?.layout()
  }, [])

  const compileAndSubmit = async () => {
    const ts_code = script.ts_code
    if (ts_code) {
      const compileMethod = getCompileMethod(script)
      if (!compileMethod) {
        return
      }
      const result = await compileMethod(ts_code)
      onSubmit(result, ts_code)
    }
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab =
    searchParams.get("tab") || (shouldShowCode ? "code" : "settings")

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        setSearchParams({ tab: value })
      }}
      className="flex h-full w-full flex-col overflow-hidden p-2 px-4 pt-0"
    >
      <TabsList className="flex w-full border-b justify-between">
        <div className="flex items-center gap-1">
          {shouldShowCode && (
            <TabsTrigger value="code" className="flex gap-1">
              <CodeIcon className="w-4 h-4" />
              Code
            </TabsTrigger>
          )}
          {shouldShowPreview && (
            <TabsTrigger value="preview" className="flex gap-1">
              <EyeIcon className="w-4 h-4" />
              Preview
            </TabsTrigger>
          )}
          <TabsTrigger value="settings" className="flex gap-1">
            <SettingsIcon className="w-4 h-4" />
            Settings
          </TabsTrigger>
        </div>
        <ExtensionToolbar />
      </TabsList>

      {revalidator.state === "loading" ? (
        <Skeleton className="mt-8 h-[20px] w-[100px] rounded-full" />
      ) : (
        <>
          {shouldShowPreview && (
            <TabsContent
              value="preview"
              ref={previewRef}
              className="data-[state=inactive]:hidden h-full w-full flex flex-col grow min-h-0"
            >
              <ExtensionPreview
                script={script}
                currentCompiledDraftCode={currentCompiledDraftCode}
                height={size?.height}
                onCompileAndSubmit={compileAndSubmit}
              />
            </TabsContent>
          )}
          <TabsContent
            value="code"
            className="data-[state=inactive]:hidden h-full w-full flex flex-col grow min-h-0"
          >
            <Suspense
              fallback={
                <Skeleton className="h-[20px] w-[100px] rounded-full" />
              }
            >
              <SimpleCodeEditorWrapper
                ref={editorRef}
                value={editorContent}
                onSave={onSubmit}
                language={language}
                bindings={script.bindings}
                scriptId={script.id}
                theme={theme === "dark" ? "vs-dark" : "light"}
                customCompile={getCompileMethod(script)}
              />
            </Suspense>
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
