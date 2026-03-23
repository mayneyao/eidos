import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"
import { Switch } from "@/components/ui/switch"

import { useView, useViewOperation } from "../../hooks"
import { CoverPreviewField } from "../shared/cover-preview-field"

export interface IGalleryViewProperties {
  hideEmptyFields?: boolean
  coverPreview?: null | string | "content" | "cover"
  fitContent?: boolean
}

const formSchema = z.object({
  hideEmptyFields: z.boolean().optional(),
  coverPreview: z.any().optional(),
  fitContent: z.boolean().optional(),
})

export const GalleryViewProperties = (props: { viewId: string }) => {
  const { updateView } = useViewOperation()
  const view = useView<IGalleryViewProperties>(props.viewId)
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      hideEmptyFields: view?.properties?.hideEmptyFields,
      coverPreview: view?.properties?.coverPreview,
      fitContent: view?.properties?.fitContent ?? true,
    },
  })

  const onSubmit = (data: IGalleryViewProperties) => console.log(data)
  const { t } = useTranslation()

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

        <CoverPreviewField
          form={form}
          viewId={props.viewId}
          tableId={view.table_id}
          updateView={updateView}
          viewProperties={view.properties}
          namespace="gallery"
        />

        <FormField
          control={form.control}
          name="fitContent"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md p-1 hover:bg-secondary">
              <FormLabel>{t("table.view.gallery.fitContent")}</FormLabel>
              <Switch
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  updateView(props.viewId, {
                    properties: {
                      ...view.properties,
                      fitContent: checked,
                    },
                  })
                }}
                className="!mt-0"
              />
              <FormMessage />
            </FormItem>
          )}
        ></FormField>
      </form>
    </Form>
  )
}
