import { useState } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { useTranslation } from "react-i18next"
import { useLoaderData, useNavigate, useRevalidator } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useExtension } from "@/apps/web-app/hooks/use-extension"

import { BlockConfig } from "./block-config"
import { ScriptConfig } from "./script-config"

export const ExtensionConfig = () => {
  const script = useLoaderData() as IExtension
  const revalidator = useRevalidator()
  const { toast } = useToast()
  const { updateExtension, deleteExtension } = useExtension()
  const { t } = useTranslation()
  const router = useNavigate()
  const { space } = useCurrentPathInfo()

  const [formData, setFormData] = useState<Partial<IExtension>>({
    name: script.name,
    description: script.description || "",
    enabled: script.enabled,
    icon: script.icon || "",
    slug: script.slug,
  })

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const hasChanges = () => {
    return (
      formData.name !== script.name ||
      formData.description !== (script.description || "") ||
      formData.enabled !== script.enabled ||
      formData.icon !== (script.icon || "") ||
      formData.slug !== script.slug
    )
  }

  const resetForm = () => {
    setFormData({
      name: script.name,
      description: script.description || "",
      enabled: script.enabled,
      icon: script.icon || "",
      slug: script.slug,
    })
  }

  const handleSubmit = async () => {
    try {
      await updateExtension({
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

  const handledeleteExtension = async () => {
    try {
      await deleteExtension(script.id)
      setShowDeleteDialog(false)
      toast({
        title: "Script Deleted Successfully",
      })
      router(`/${space}/extensions`)
    } catch (error) {
      toast({
        title: "Failed to delete script",
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
            <CardDescription>
              {t("extension.config.basicInfoDescription")}
            </CardDescription>
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
              <label htmlFor="slug" className="text-sm font-medium">
                Slug
              </label>
              <Input
                id="slug"
                value={formData.slug}
                className="col-span-3"
                onChange={(e) =>
                  setFormData({ ...formData, slug: e.target.value })
                }
                placeholder="Enter unique slug identifier"
              />
            </div>
            {/* readonly version */}
            <div className="grid grid-cols-4 items-center gap-2">
              <label htmlFor="version" className="text-sm font-medium">
                Version
              </label>
              <Input
                id="version"
                value={script.version}
                className="col-span-3"
                readOnly
                disabled
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-2">
              <label htmlFor="icon" className="text-sm font-medium">
                {t("common.icon")}
              </label>
              <div className="col-span-3">
                <label
                  htmlFor="icon-file-input"
                  className="cursor-pointer flex items-center justify-center w-16 h-16 border rounded hover:bg-accent"
                >
                  {formData.icon && formData.icon.startsWith("data:image/") ? (
                    <img
                      src={formData.icon}
                      alt="Icon Preview"
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground p-1 text-center">
                      {t("extension.config.selectIconPlaceholder")}
                    </span>
                  )}
                </label>
                <input
                  id="icon-file-input"
                  type="file"
                  accept=".svg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      if (file.type === "image/svg+xml") {
                        if (file.size > 512 * 1024) {
                          // 512KB limit
                          toast({
                            title: "File Too Large",
                            description:
                              "Please select an icon file smaller than 512KB.",
                            variant: "destructive",
                          })
                          if (e.target) {
                            e.target.value = ""
                          }
                          return
                        }
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          setFormData({
                            ...formData,
                            icon: `data:image/svg+xml,${encodeURIComponent(
                              reader.result as string
                            )}`,
                          })
                        }
                        reader.onerror = () => {
                          toast({
                            title: "Failed to read file",
                            description:
                              "An error occurred while reading the file.",
                            variant: "destructive",
                          })
                        }
                        reader.readAsText(file) // Read as text for SVG
                      } else {
                        toast({
                          title: "Invalid File Type",
                          description: "Please select an SVG file.",
                          variant: "destructive",
                        })
                        // Reset the input if the file is not an SVG
                        if (e.target) {
                          e.target.value = ""
                        }
                      }
                    }
                  }}
                />
              </div>
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

      {script.type === "script" && <ScriptConfig />}
      {script.type === "block" && <BlockConfig />}

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">
            {t("extension.config.dangerZone")}
          </CardTitle>
          <CardDescription>
            {t("extension.config.dangerZoneDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="flex flex-col">
            <p className="font-medium">
              {t("extension.config.deleteExtension")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("extension.config.deleteExtensionDescription")}
            </p>
          </div>
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                {t("extension.config.deleteExtensionButton")}
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
                <Button variant="destructive" onClick={handledeleteExtension}>
                  {t("common.delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
