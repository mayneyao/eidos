import { IScript } from "@/worker/web-worker/meta-table/script"
import { useMount } from "ahooks"
import { Suspense, lazy, useCallback, useEffect, useState } from "react"
import { useLoaderData, useNavigate, useRevalidator } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"

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
  const revalidator = useRevalidator()
  const [code, setCode] = useState(script.code)

  useEffect(() => {
    setCode(script.code)
  }, [script.code])

  useMount(() => {
    revalidator.revalidate()
  })

  const { ref: nameRef } = useEditableElement({
    onSave(value) {
      updateScript({
        ...script,
        name: value,
      })
      revalidator.revalidate()
    },
  })

  const { ref: descRef } = useEditableElement({
    onSave(value) {
      updateScript({
        ...script,
        description: value,
      })
      revalidator.revalidate()
    },
  })

  const { toast } = useToast()
  const onSubmit = useCallback(
    async (code: string) => {
      if (code !== script.code) {
        await updateScript({
          ...script,
          code,
        })
        toast({
          title: "Code Updated Successfully",
        })
      }
    },
    [script, toast, updateScript]
  )

  const { space } = useCurrentPathInfo()
  const handleDeleteScript = async () => {
    deleteScript(script.id)
    router(`/${space}/extensions`)
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
    <div className="p-6">
      <Tabs defaultValue="account" className="w-[600px] md:w-[920px]">
        <TabsList>
          <TabsTrigger value="account">Basic</TabsTrigger>
          <TabsTrigger value="password">Settings</TabsTrigger>
        </TabsList>

        {revalidator.state === "loading" ? (
          <Skeleton className="mt-8 h-[20px] w-[100px] rounded-full" />
        ) : (
          <>
            <TabsContent value="account">
              <div className="flex flex-col gap-4">
                <div className="flex justify-between">
                  <h2 className="mb-2 text-xl font-semibold">
                    <span ref={nameRef}>{script.name}</span> ({script.version})
                  </h2>
                  <Switch
                    checked={script.enabled}
                    onCheckedChange={(checked) =>
                      handleToggleEnabled(script.id, checked)
                    }
                  ></Switch>
                </div>
                <p ref={descRef}>{script.description}</p>
                <Separator />
                <Suspense
                  fallback={
                    <Skeleton className="h-[20px] w-[100px] rounded-full" />
                  }
                >
                  <CodeEditor
                    value={code}
                    onChange={setCode}
                    onSave={onSubmit}
                    language={
                      script.type === "prompt" ? "markdown" : "javascript"
                    }
                  />
                </Suspense>
                <div className="flex justify-between">
                  <Button type="submit" onClick={() => onSubmit(code)}>
                    Update
                  </Button>
                  <Button variant="outline" onClick={handleDeleteScript}>
                    Delete
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="password">
              <ExtensionConfig />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
