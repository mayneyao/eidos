import { useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { useLoaderData, useRevalidator } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"

import { useScript } from "../hooks/use-script"
import { BlockConfig } from "./block-config"
import { PromptConfig } from "./prompt-config"
import { ScriptConfig } from "./script-config"

export const ExtensionConfig = () => {
  const script = useLoaderData() as IScript
  const revalidator = useRevalidator()
  const { toast } = useToast()
  const { updateScript } = useScript()
  const { t } = useTranslation()

  const [formData, setFormData] = useState<Partial<IScript>>({
    name: script.name,
    description: script.description || "",
    enabled: script.enabled,
  })

  const hasChanges = () => {
    return (
      formData.name !== script.name ||
      formData.description !== script.description ||
      formData.enabled !== script.enabled
    )
  }

  const resetForm = () => {
    setFormData({
      name: script.name,
      description: script.description || "",
      enabled: script.enabled,
    })
  }

  const handleSubmit = async () => {
    try {
      await updateScript({
        ...script,
        ...formData,
      })
      revalidator.revalidate()
      toast({
        title: "Basic Info Updated Successfully",
      })
    } catch (error) {
      toast({
        title: "Failed to update basic info",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle>{t("extension.config.basicInfo")}</CardTitle>
            <CardDescription>{t("extension.config.basicInfoDescription")}</CardDescription>
          </div>
          {hasChanges() && (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {t("extension.config.unsavedChanges")}
              </p>
              <Button variant="outline" size="xs" onClick={resetForm}>
                {t("common.cancel")}
              </Button>
              <Button size="xs" onClick={handleSubmit}>
                {t("common.update")}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <div className="grid grid-cols-4 items-center gap-2">
              <label htmlFor="id" className="text-sm font-medium">
                ID
              </label>
              <Input
                id="id"
                value={script.id}
                className="col-span-3"
                readOnly
                disabled
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                {t("common.name")}
              </label>
              <Input
                id="name"
                value={formData.name}
                className="col-span-3"
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-2">
              <label htmlFor="description" className="text-sm font-medium">
                {t("common.description")}
              </label>
              <Textarea
                id="description"
                value={formData.description}
                className="col-span-3"
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-2">
              <label htmlFor="enabled" className="text-sm font-medium">
                Enabled
              </label>
              <div className="col-span-3">
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enabled: checked })
                  }
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {script.type === "prompt" && <PromptConfig />}
      {script.type === "script" && <ScriptConfig />}
      {script.type === "m_block" && <BlockConfig />}
    </div>
  )
}
