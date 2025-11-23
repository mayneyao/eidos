import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import kebabCase from "lodash/kebabCase"
import {
  ArrowLeft,
  Database,
  FileText,
  Folder,
  Image,
  PlusCircle,
} from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import * as z from "zod"

import { MsgType } from "@/lib/const"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/react-hook-form/form"

import { SetupLayout } from "./shared-layout"
import { useViewTransition } from "./useViewTransition"

const spaceFormSchema = z.object({
  spaceName: z.string().min(1, "Space name is required"),
})

type SpaceFormValues = z.infer<typeof spaceFormSchema>

export function CreateSpaceGuide() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { navigateWithTransition } = useViewTransition()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<SpaceFormValues>({
    resolver: zodResolver(spaceFormSchema),
    defaultValues: {
      spaceName: "",
    },
  })

  async function onCreateSpace() {
    const data = form.getValues()

    if (!data.spaceName.trim()) {
      toast({
        title: t("space.select.spaceName", "Space name required"),
        description: t(
          "space.select.spaceNamePlaceholder",
          "Please enter a space name"
        ),
      })
      return
    }

    setIsLoading(true)
    try {
      const spaceName = /^[a-zA-Z0-9-]+$/.test(data.spaceName)
        ? data.spaceName
        : kebabCase(data.spaceName)

      const res = await window.eidos.invoke(MsgType.CreateSpace, {
        spaceName,
        enableSync: false,
      })

      if (res.success) {
        navigate(`/`)
      } else {
        toast({
          title: t("common.error", "Error"),
          description: t(
            "space.select.spaceAlreadyExists",
            "Failed to create space"
          ),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to create space:", error)
      toast({
        title: t("common.error", "Error"),
        description: t(
          "space.select.spaceAlreadyExists",
          "Failed to create space"
        ),
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToStorage = () => {
    navigateWithTransition("/initial-setup")
  }

  const currentSpaceName = form.watch("spaceName")
  const previewSpaceName = currentSpaceName
    ? /^[a-zA-Z0-9-]+$/.test(currentSpaceName)
      ? currentSpaceName
      : kebabCase(currentSpaceName)
    : "your-space"

  const spaceStructure = [
    {
      name: previewSpaceName,
      icon: <Folder className="w-4 h-4 text-blue-600" />,
      children: [
        {
          name: "db.sqlite3",
          icon: <Database className="w-4 h-4 text-purple-600" />,
          description: t("space.structure.database", "Your data lives here"),
        },
        {
          name: "files",
          icon: <Folder className="w-4 h-4 text-yellow-600" />,
          description: t(
            "space.structure.files",
            "All your files and attachments"
          ),
          children: [
            {
              name: "documents.pdf",
              icon: <FileText className="w-4 h-4 text-red-600" />,
            },
            {
              name: "images.jpg",
              icon: <Image className="w-4 h-4 text-green-600" />,
            },
          ],
        },
      ],
    },
  ]

  const renderStructure = (items: any[], level = 0) => {
    return items.map((item, index) => (
      <div key={index} className={`ml-${level * 4}`}>
        <div className="flex items-center gap-2 py-1">
          {item.icon}
          <span className="text-sm text-foreground font-mono">{item.name}</span>
          {item.description && (
            <span className="text-xs text-muted-foreground ml-2">
              ← {item.description}
            </span>
          )}
        </div>
        {item.children && renderStructure(item.children, level + 1)}
      </div>
    ))
  }

  return (
    <SetupLayout
      onBack={handleBackToStorage}
      backLabel={t("common.back", "Back to Storage Setup")}
    >
      <div className="max-w-3xl mx-auto">
        {/* Main Card */}
        <div
          className="bg-background rounded-3xl shadow-2xl border border-border overflow-hidden"
          style={{ viewTransitionName: "setup-card" } as React.CSSProperties}
        >
          <div className="px-6 pt-6 pb-4">
            <div
              className="text-center"
              style={
                { viewTransitionName: "setup-header" } as React.CSSProperties
              }
            >
              <PlusCircle className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground mb-2">
                {t("space.select.createSpace", "Create Your First Space")}
              </h1>
              <p className="text-muted-foreground text-base">
                {t(
                  "space.create.description",
                  "A space is your personal workspace where you can organize documents, data, and files. Each space is completely independent and secure."
                )}
              </p>
            </div>
          </div>

          {/* Card Body */}
          <div className="px-6 pb-6">
            <div className="flex gap-8">
              <div className="flex-[3]">
                <h3 className="text-lg font-medium text-foreground mb-4">
                  {t("space.create.preview", "Space Structure Preview")}
                </h3>
                <div className="bg-muted/50 rounded-xl p-4 border border-border">
                  <div className="font-mono text-sm">
                    {renderStructure(spaceStructure)}
                  </div>
                </div>
              </div>
              <div className="flex-[2]">
                <h3 className="text-lg font-medium text-foreground mb-4">
                  {t("space.create.setup", "Setup Your Space")}
                </h3>
                <Form {...form}>
                  <form className="space-y-5">
                    <FormField
                      control={form.control}
                      name="spaceName"
                      render={({ field }) => (
                        <FormItem>
                          <Label className="text-foreground font-medium">
                            {t("space.select.spaceName", "Space Name")}
                          </Label>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder={t(
                                "space.select.spaceNamePlaceholder",
                                "My Workspace"
                              )}
                              className="h-12 text-base"
                              autoFocus
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-3">
                      <Button
                        type="button"
                        size="lg"
                        onClick={onCreateSpace}
                        disabled={isLoading}
                        className="flex-1 h-12 text-base font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {isLoading ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            {t("common.creating", "Creating...")}
                          </div>
                        ) : (
                          <>
                            <PlusCircle className="w-4 h-4 mr-2" />
                            {t("space.select.createSpace", "Create Space")}
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SetupLayout>
  )
}

export default function CreateSpacePage() {
  return <CreateSpaceGuide />
}
