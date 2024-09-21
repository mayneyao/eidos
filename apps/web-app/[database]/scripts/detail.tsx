import { Suspense, lazy, useCallback, useRef } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { useMount } from "ahooks"
import { useLoaderData, useNavigate, useRevalidator } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"

import { ExtensionConfig } from "./config/config"
// import { CodeEditor } from "./editor/code-editor"
import { useEditableElement } from "./hooks/use-editable-element"
import { useScript } from "./hooks/use-script"

const CodeEditor = lazy(() => import("./editor/code-editor"))

export const ScriptDetailPage = () => {
  const script = useLoaderData() as IScript
  const { deleteScript, enableScript, disableScript, updateScript } =
    useScript()
  const router = useNavigate()
  const editorRef = useRef<{ save: () => void }>(null)
  const revalidator = useRevalidator()
  const language =
    script.type === "prompt"
      ? "markdown"
      : script.ts_code
      ? "typescript"
      : "javascript"

  useMount(() => {
    revalidator.revalidate()
  })

  const handleSave = useCallback(
    (value: any, key: string) => {
      updateScript({
        ...script,
        [key]: value,
      })
      revalidator.revalidate()
    },
    [revalidator, script, updateScript]
  )
  const { ref: nameRef } = useEditableElement({
    onSave: (value) => handleSave(value, "name"),
  })

  const { ref: descRef } = useEditableElement({
    onSave: (value) => handleSave(value, "description"),
  })

  const { toast } = useToast()
  const onSubmit = useCallback(
    async (code: string, ts_code?: string) => {
      if (code !== script.code || ts_code !== script.ts_code) {
        await updateScript({
          ...script,
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
  const handleDeleteScript = async () => {
    deleteScript(script.id)
    router(`/${space}/extensions`)
  }

  const manualSave = () => {
    editorRef.current?.save()
  }
  const handleToggleEnabled = async (id: string, checked: boolean) => {
    if (checked) {
      await enableScript(id)
    } else {
      await disableScript(id)
    }
    revalidator.revalidate()
  }

  return (
    <Tabs
      defaultValue="account"
      className="flex h-full w-full flex-col overflow-hidden p-2 px-4 pt-0"
    >
      <TabsList className=" w-max">
        <TabsTrigger value="account">Basic</TabsTrigger>
        <TabsTrigger value="password">Settings</TabsTrigger>
      </TabsList>

      <hr className="my-1" />

      {revalidator.state === "loading" ? (
        <Skeleton className="mt-8 h-[20px] w-[100px] rounded-full" />
      ) : (
        <>
          <TabsContent value="account" className="h-full w-full">
            <div className="flex h-full flex-col gap-4">
              <div className="flex justify-between">
                <h2 className="mb-2 flex items-end  gap-2 text-xl font-semibold">
                  <span ref={nameRef}>{script.name}</span> ({script.version})
                  <Switch
                    checked={script.enabled}
                    onCheckedChange={(checked) =>
                      handleToggleEnabled(script.id, checked)
                    }
                  ></Switch>
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    onClick={handleDeleteScript}
                    size="sm"
                  >
                    Delete
                  </Button>
                  <Button type="submit" onClick={manualSave} size="sm">
                    Update
                  </Button>
                </div>
              </div>
              <p ref={descRef} className=" w-full">
                {script.description}
              </p>
              <Separator />
              <div className="mb-2 flex grow flex-col">
                <Suspense
                  fallback={
                    <Skeleton className="h-[20px] w-[100px] rounded-full" />
                  }
                >
                  <CodeEditor
                    ref={editorRef}
                    value={script.ts_code || script.code}
                    onSave={onSubmit}
                    language={language}
                  />
                </Suspense>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="password">
            <ExtensionConfig />
          </TabsContent>
        </>
      )}
    </Tabs>
  )
}
