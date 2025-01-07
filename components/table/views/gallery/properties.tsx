import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { FileText, Columns, Grid3X3, ToyBrickIcon, ImageIcon } from "lucide-react"

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
      coverPreview: view?.properties?.coverPreview || "content",
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

  const displayCoverPreview = [
    ...coverPreviewItems.content,
    ...coverPreviewItems.fields,
    ...coverPreviewItems.mblocks,
  ].find((item) => item.value === form.watch("coverPreview"))?.label

  const handleItemClick = (value: string) => {
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
    item 
  }: { 
    item: { 
      value: string; 
      label: string; 
      type?: string 
    } 
  }) => {
    const getIcon = () => {
      if (item.value === 'content') return <FileText className="mr-2 h-4 w-4" />
      if (item.type === 'field') return <ImageIcon className="mr-2 h-4 w-4" />
      if (item.type === 'mblock') return <ToyBrickIcon className="mr-2 h-4 w-4" />
      return null
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
    showDivider 
  }: { 
    items: Array<{ value: string; label: string }>;
    showDivider?: boolean 
  }) => (
    <>
      {showDivider && <hr className="my-1" />}
      {items.map(item => <PreviewButton key={item.value} item={item} />)}
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
                    className="p-1"
                    align="end"
                    container={
                      document.querySelector("#view-editor") as HTMLElement
                    }
                  >
                    <div className="flex flex-col">
                      <PreviewSection items={coverPreviewItems.content} />
                      {coverPreviewItems.fields.length > 0 && (
                        <PreviewSection items={coverPreviewItems.fields} showDivider />
                      )}
                      {coverPreviewItems.mblocks.length > 0 && (
                        <PreviewSection items={coverPreviewItems.mblocks} showDivider />
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
