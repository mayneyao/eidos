import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Label } from "@/components/ui/label"
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

  const hideEmptyFields = form.watch("hideEmptyFields")
  const fitContent = form.watch("fitContent")

  return (
    <div className="space-y-3">
      {/* Hide Empty Fields */}
      <div className="flex items-center justify-between py-1">
        <Label className="text-xs font-medium text-foreground">
          {t("table.view.gallery.hideEmptyFields")}
        </Label>
        <Switch
          checked={Boolean(hideEmptyFields)}
          onCheckedChange={(checked) => {
            form.setValue("hideEmptyFields", checked)
            updateView(props.viewId, {
              properties: {
                ...view.properties,
                hideEmptyFields: checked,
              },
            })
          }}
          className="scale-90"
        />
      </div>

      {/* Cover Preview */}
      <CoverPreviewField
        form={form}
        viewId={props.viewId}
        tableId={view.table_id}
        updateView={updateView}
        viewProperties={view.properties}
        namespace="gallery"
      />

      {/* Fit Content */}
      <div className="flex items-center justify-between py-1">
        <Label className="text-xs font-medium text-foreground">
          {t("table.view.gallery.fitContent")}
        </Label>
        <Switch
          checked={fitContent}
          onCheckedChange={(checked) => {
            form.setValue("fitContent", checked)
            updateView(props.viewId, {
              properties: {
                ...view.properties,
                fitContent: checked,
              },
            })
          }}
          className="scale-90"
        />
      </div>
    </div>
  )
}
