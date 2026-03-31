import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FileText } from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { useTableFields } from "@/apps/web-app/hooks/use-table-fields"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"
import { cn } from "@/lib/utils"

import { useView, useViewOperation } from "../../hooks"
import { makeHeaderIcons } from "../../fields/header-icons"

const icons = makeHeaderIcons(18)

export interface IKanbanViewProperties {
  //   hideEmptyFields?: boolean
  groupByField?: string
  cardSize?: "small" | "medium" | "large"
  //   collapseAll?: boolean
  //   coverPreview?: null | string | "content" | "cover"
}

const formSchema = z.object({
  //   hideEmptyFields: z.boolean().optional(),
  groupByField: z.string().optional(),
  cardSize: z.enum(["small", "medium", "large"]).optional(),
  //   collapseAll: z.boolean().optional(),
  //   coverPreview: z.enum(["content", "cover"]).optional().nullable(),
})

export const KanbanViewProperties = ({ viewId }: { viewId: string }) => {
  const { updateView } = useViewOperation()
  const view = useView<IKanbanViewProperties>(viewId)
  const { t } = useTranslation()
  const { fields } = useTableFields(view.table_id)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      //   hideEmptyFields: view?.properties?.hideEmptyFields,
      groupByField: view?.properties?.groupByField,
      cardSize: view?.properties?.cardSize,
      //   collapseAll: view?.properties?.collapseAll,
      //   coverPreview: view?.properties?.coverPreview as
      //     | "content"
      //     | "cover"
      //     | null
      //     | undefined,
    },
  })

  const onSubmit = (data: IKanbanViewProperties) => console.log(data)

  const displayGroupByField =
    fields.find((f) => f.name === form.watch("groupByField"))?.label ||
    t("table.view.kanban.selectField")

  const handleFieldSelect = (value: string) => {
    form.setValue("groupByField", value)
    setPopoverOpen(false)
    updateView(viewId, {
      properties: {
        ...view.properties,
        groupByField: value,
      },
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* <FormField
          control={form.control}
          name="hideEmptyFields"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md p-1 hover:bg-secondary">
              <FormLabel>{t("table.view.kanban.hideEmptyFields")}</FormLabel>
              <Switch
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  updateView(viewId, {
                    properties: {
                      ...view.properties,
                      hideEmptyFields: checked,
                    },
                  })
                }}
                className="!mt-0"
              />
              <FormMessage />
            </FormItem>
          )}
        /> */}

        {/* <FormField
          control={form.control}
          name="showCardCount"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md p-1 hover:bg-secondary">
              <FormLabel>{t("table.view.kanban.showCardCount")}</FormLabel>
              <Switch
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  updateView(viewId, {
                    properties: {
                      ...view.properties,
                      showCardCount: checked,
                    },
                  })
                }}
                className="!mt-0"
              />
              <FormMessage />
            </FormItem>
          )}
        /> */}

        <div className="flex items-center justify-between py-1.5">
          <Label className="text-xs font-medium text-foreground">
            {t("table.view.kanban.groupByField")}
          </Label>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="xs" className="h-7 text-xs">
                {displayGroupByField}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-1 max-h-[280px] overflow-y-auto w-[220px]"
              align="end"
            >
              <div className="flex flex-col gap-0.5">
                {fields.map((f) => {
                  const iconSvgString = icons[f.type]({
                    bgColor: "#aaa",
                    fgColor: "currentColor",
                  })
                  const isSelected = form.watch("groupByField") === f.name
                  return (
                    <button
                      key={f.name}
                      onClick={() => handleFieldSelect(f.name)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50 text-foreground"
                      )}
                    >
                      <span
                        className="h-4 w-4 shrink-0"
                        dangerouslySetInnerHTML={{
                          __html: iconSvgString,
                        }}
                      />
                      <span className="truncate">{f.label}</span>
                    </button>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center justify-between py-1.5">
          <Label className="text-xs font-medium text-foreground">
            {t("table.view.kanban.cardSize")}
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="xs" className="h-7 text-xs">
                {t(
                  `table.view.kanban.size.${form.watch("cardSize") || "medium"}`
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-1 w-[160px]" align="end">
              <div className="flex flex-col gap-0.5">
                {["small", "medium", "large"].map((size) => {
                  const isSelected =
                    (form.watch("cardSize") || "medium") === size
                  return (
                    <button
                      key={size}
                      onClick={() => {
                        form.setValue(
                          "cardSize",
                          size as "small" | "medium" | "large"
                        )
                        updateView(viewId, {
                          properties: {
                            ...view.properties,
                            cardSize: size,
                          },
                        })
                      }}
                      className={cn(
                        "flex items-center px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50 text-foreground"
                      )}
                    >
                      {t(`table.view.kanban.size.${size}`)}
                    </button>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {/*
        <FormField
          control={form.control}
          name="collapseAll"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md p-1 hover:bg-secondary">
              <FormLabel>{t("table.view.kanban.collapseAll")}</FormLabel>
              <Switch
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  updateView(viewId, {
                    properties: {
                      ...view.properties,
                      collapseAll: checked,
                    },
                  })
                }}
                className="!mt-0"
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <CoverPreviewField
          form={form}
          viewId={viewId}
          tableId={view.table_id}
          updateView={updateView}
          viewProperties={view.properties}
          namespace="kanban"
        /> */}
      </form>
    </Form>
  )
}
