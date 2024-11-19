import { IScript } from "@/worker/web-worker/meta-table/script"
import { ExternalLinkIcon } from "lucide-react"
import { useMemo } from "react"
import { Link, useLoaderData, useRevalidator } from "react-router-dom"

import { useAIConfigStore } from "@/apps/web-app/settings/ai/store"
import { AIModelSelect } from "@/components/ai-chat/ai-chat-model-select"
import { AppendList } from "@/components/eui/append-list"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"

import { useAllScripts } from "../hooks/use-all-scripts"
import { useScript } from "../hooks/use-script"

const ExtActions = ({ value }: any) => {
  return (
    <Link
      to={`${window.location.href.split("/").slice(0, -1).join("/")}/${value}`}
      target="_blank"
      className=" opacity-0 group-hover:opacity-70"
    >
      <Button variant="ghost" size="sm">
        <ExternalLinkIcon className="h-4 w-4" />
      </Button>
    </Link>
  )
}
export const PromptConfig = () => {
  const script = useLoaderData() as IScript
  const { updateScript } = useScript()
  const revalidator = useRevalidator()
  const { toast } = useToast()
  const allScripts = useAllScripts()
  const { aiConfig } = useAIConfigStore()
  const handleSave = async (model: string) => {
    await updateScript({
      ...script,
      model,
    })
    revalidator.revalidate()
    toast({
      title: "Prompt Updated Successfully",
    })
  }
  const handleAddAction = async (action: string) => {
    await updateScript({
      ...script,
      prompt_config: {
        ...script.prompt_config,
        actions: [...(script.prompt_config?.actions || []), action],
      },
    })
    revalidator.revalidate()
    toast({
      title: "Action Added Successfully",
    })
  }
  const handleRemoveAction = async (action: string) => {
    await updateScript({
      ...script,
      prompt_config: {
        ...script.prompt_config,
        actions: script.prompt_config?.actions?.filter((a) => a !== action),
      },
    })
    revalidator.revalidate()
    toast({
      title: "Action Removed Successfully",
    })
  }
  const list = useMemo(() => {
    return (
      script.prompt_config?.actions?.map((action) => ({
        label: allScripts.find((s) => s.id === action)?.name || action,
        value: action,
      })) || []
    )
  }, [allScripts, script.prompt_config?.actions])

  const options = useMemo(() => {
    return allScripts
      .map((script) => ({
        label: script.name,
        value: script.id,
      }))
      .filter((s) => !script.prompt_config?.actions?.includes(s.value))
  }, [allScripts, script.prompt_config?.actions])
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt Config</CardTitle>
        <CardDescription>Select a model for this prompt</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mt-2 grid max-w-[400px] grid-cols-7 items-start gap-4">
          <div className="col-span-2">Model</div>
          <div className="col-span-5">
            <AIModelSelect
              value={script.model ?? ""}
              onValueChange={handleSave}
              localModels={aiConfig.localModels}
              className="w-full"
            />
          </div>
        </div>
        <div className="mt-2 grid max-w-[400px] grid-cols-7 items-start gap-4">
          <div className="col-span-2">Actions</div>
          <div className="col-span-5  justify-start">
            <AppendList
              list={list}
              onAppend={handleAddAction}
              onRemove={handleRemoveAction}
              options={options}
              MoreActions={ExtActions}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
