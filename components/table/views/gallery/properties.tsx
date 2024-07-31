import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
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
  const [popoverOpen, setPopoverOpen] = useState(false)

  const onSubmit = (data: IGalleryViewProperties) => console.log(data)
  const fileFields = useFileFields()

  const coverPreviewItems = [
    // {
    //   value: null,
    //   label: "None",
    // },
    // {
    //   value: "cover",
    //   label: "Cover",
    // },
    {
      value: "content",
      label: "Content",
    },
    ...fileFields.map((field) => ({
      value: field.table_column_name,
      label: field.name,
      type: "field",
    })),
  ]

  const displayCoverPreview = coverPreviewItems.find(
    (item) => item.value === form.watch("coverPreview")
  )?.label

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="hideEmptyFields"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md p-1 hover:bg-secondary">
              <FormLabel>Hide empty fields</FormLabel>
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
              <FormLabel>Cover preview</FormLabel>
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
                      {coverPreviewItems.map((item) => (
                        <Button
                          key={item.value}
                          onClick={() => {
                            form.setValue("coverPreview", item.value)
                            setPopoverOpen(false)
                            updateView(props.viewId, {
                              properties: {
                                ...view.properties,
                                coverPreview: item.value,
                              },
                            })
                          }}
                          variant="ghost"
                          className="justify-start"
                          size="sm"
                        >
                          {item.label}
                        </Button>
                      ))}
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
