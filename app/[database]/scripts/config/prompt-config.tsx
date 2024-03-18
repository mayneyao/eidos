import { IScript } from "@/worker/web-worker/meta_table/script"
import { useLoaderData, useRevalidator } from "react-router-dom"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { AIModelSelect } from "@/components/ai-chat/ai-chat-model-select"

import { useScript } from "../hooks/use-script"

export const PromptConfig = () => {
  const script = useLoaderData() as IScript
  const { updateScript } = useScript()
  const revalidator = useRevalidator()
  const { toast } = useToast()

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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt Config</CardTitle>
        <CardDescription>Select a model for this prompt</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mt-1 flex items-center gap-4">
          <span>Model</span>
          <AIModelSelect
            value={script.model ?? ""}
            onValueChange={handleSave}
          />
        </div>
      </CardContent>
    </Card>
  )
}
