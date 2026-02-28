import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FileText } from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { useTableFields } from "@/apps/web-app/hooks/use-table-fields"
import { Button } from "@/components/ui/button"
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

        <FormField
          control={form.control}
          name="groupByField"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md p-1 hover:bg-secondary">
              <FormLabel>{t("table.view.kanban.groupByField")}</FormLabel>
              <FormControl>
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="!mt-0">
                      {displayGroupByField}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="p-1 max-h-[300px] overflow-y-auto"
                    align="end"
                    container={
                      document.querySelector("#view-editor") as HTMLElement
                    }
                  >
                    <div className="flex flex-col">
                      {fields.map((f) => {
                        const iconSvgString = icons[f.type]({
                          bgColor: "#aaa",
                          fgColor: "currentColor",
                        })
                        return (
                          <Button
                            key={f.name}
                            onClick={() => handleFieldSelect(f.name)}
                            variant="ghost"
                            className="justify-start"
                            size="sm"
                          >
                            <span
                              className="mr-2 h-4 w-4"
                              dangerouslySetInnerHTML={{
                                __html: iconSvgString,
                              }}
                            />
                            {f.label}
                          </Button>
                        )
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cardSize"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md p-1 hover:bg-secondary">
              <FormLabel>{t("table.view.kanban.cardSize")}</FormLabel>
              <FormControl>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="!mt-0">
                      {t(`table.view.kanban.size.${field.value || "medium"}`)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="p-1"
                    align="end"
                    container={
                      document.querySelector("#view-editor") as HTMLElement
                    }
                  >
                    <div className="flex flex-col">
                      {["small", "medium", "large"].map((size) => (
                        <Button
                          key={size}
                          onClick={() => {
                            field.onChange(size as "small" | "medium" | "large")
                            updateView(viewId, {
                              properties: {
                                ...view.properties,
                                cardSize: size,
                              },
                            })
                          }}
                          variant="ghost"
                          className="justify-start"
                          size="sm"
                        >
                          {t(`table.view.kanban.size.${size}`)}
                        </Button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
