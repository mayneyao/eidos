import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  BanIcon,
  Columns,
  FileText,
  Grid3X3,
  ImageIcon,
  ToyBrickIcon,
} from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"
import { useAllMblocks } from "@/apps/web-app/[database]/scripts/hooks/use-all-mblocks"

import { useFileFields, useView, useViewOperation } from "../../hooks"

export interface IGalleryViewProperties {
  hideEmptyFields?: boolean
  coverPreview?: null | string | "content" | "cover"
}

const formSchema = z.object({
  hideEmptyFields: z.boolean().optional(),
  coverPreview: z.any().optional(),
})

export const GalleryViewProperties = (props: { viewId: string }) => {
  const { updateView } = useViewOperation()
  const view = useView<IGalleryViewProperties>(props.viewId)
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      hideEmptyFields: view?.properties?.hideEmptyFields,
      coverPreview: view?.properties?.coverPreview,
    },
  })
  const { mblocks } = useAllMblocks()

  const [popoverOpen, setPopoverOpen] = useState(false)
  const { t } = useTranslation()

  const onSubmit = (data: IGalleryViewProperties) => console.log(data)
  const fileFields = useFileFields()

  const coverPreviewItems = {
    content: [
      {
        value: null,
        label: t("table.view.gallery.none"),
      },
      {
        value: "content",
        label: t("table.view.gallery.content"),
      },
    ],
    fields: fileFields.map((field) => ({
      value: field.table_column_name,
      label: field.name,
      type: "field",
    })),
    mblocks: mblocks.map((mblock) => ({
      value: `block://${mblock.id}`,
      label: mblock.name,
      type: "mblock",
    })),
  }

  const displayCoverPreview =
    [
      ...coverPreviewItems.content,
      ...coverPreviewItems.fields,
      ...coverPreviewItems.mblocks,
    ].find((item) => item.value === form.watch("coverPreview"))?.label || "None"

  const handleItemClick = (value: string | null) => {
    form.setValue("coverPreview", value)
    setPopoverOpen(false)
    updateView(props.viewId, {
      properties: {
        ...view.properties,
        coverPreview: value,
      },
    })
  }

  const PreviewButton = ({
    item,
  }: {
    item: {
      value: string | null
      label: string
      type?: string
    }
  }) => {
    const getIcon = () => {
      if (item.value === "content") return <FileText className="mr-2 h-4 w-4" />
      if (item.type === "field") return <ImageIcon className="mr-2 h-4 w-4" />
      if (item.type === "mblock")
        return <ToyBrickIcon className="mr-2 h-4 w-4" />
      return <BanIcon className="mr-2 h-4 w-4" />
    }

    return (
      <Button
        onClick={() => handleItemClick(item.value)}
        variant="ghost"
        className="justify-start"
        size="sm"
      >
        {getIcon()}
        {item.label}
      </Button>
    )
  }

  const PreviewSection = ({
    items,
    showDivider,
  }: {
    items: Array<{ value: string | null; label: string }>
    showDivider?: boolean
  }) => (
    <>
      {showDivider && <hr className="my-1" />}
      {items.map((item) => (
        <PreviewButton key={item.value} item={item} />
      ))}
    </>
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="hideEmptyFields"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md p-1 hover:bg-secondary">
              <FormLabel>{t("table.view.gallery.hideEmptyFields")}</FormLabel>
              <Switch
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  updateView(props.viewId, {
                    properties: {
                      ...view.properties,
                      hideEmptyFields: checked,
                    },
                  })
                }}
                className="!mt-0"
              ></Switch>
              <FormMessage />
            </FormItem>
          )}
        ></FormField>
        <FormField
          control={form.control}
          name="coverPreview"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md p-1 hover:bg-secondary">
              <FormLabel>{t("table.view.gallery.coverPreview")}</FormLabel>
              <FormControl>
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger className="!mt-0">
                    {displayCoverPreview}
                  </PopoverTrigger>
                  <PopoverContent
                    className="p-1 max-h-[300px] overflow-y-auto"
                    align="end"
                    container={
                      document.querySelector("#view-editor") as HTMLElement
                    }
                  >
                    <div className="flex flex-col">
                      <PreviewSection items={coverPreviewItems.content} />
                      {coverPreviewItems.fields.length > 0 && (
                        <PreviewSection
                          items={coverPreviewItems.fields}
                          showDivider
                        />
                      )}
                      {coverPreviewItems.mblocks.length > 0 && (
                        <PreviewSection
                          items={coverPreviewItems.mblocks}
                          showDivider
                        />
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        ></FormField>
      </form>
    </Form>
  )
}
