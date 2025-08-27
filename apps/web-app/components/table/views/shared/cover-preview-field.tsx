import { useState } from "react"
import { BanIcon, FileText, ImageIcon, ToyBrickIcon } from "lucide-react"
import type { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"
import { useAllMblocks } from "@/apps/web-app/hooks/use-all-mblocks"

import { useFileFields } from "../../hooks"

interface PreviewButtonProps {
  item: {
    value: string | null
    label: string
    type?: string
  }
  handleItemClick: (value: string | null) => void
}

const PreviewButton = ({ item, handleItemClick }: PreviewButtonProps) => {
  const getIcon = () => {
    if (item.value === "__CONTENT__")
      return <FileText className="mr-2 h-4 w-4" />
    if (item.type === "field") return <ImageIcon className="mr-2 h-4 w-4" />
    if (item.type === "mblock") return <ToyBrickIcon className="mr-2 h-4 w-4" />
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

interface PreviewSectionProps {
  items: Array<{ value: string | null; label: string; type?: string }>
  showDivider?: boolean
  handleItemClick: (value: string | null) => void
}

const PreviewSection = ({
  items,
  showDivider,
  handleItemClick,
}: PreviewSectionProps) => (
  <>
    {showDivider && <hr className="my-1" />}
    {items.map((item) => (
      <PreviewButton
        key={item.value}
        item={item}
        handleItemClick={handleItemClick}
      />
    ))}
  </>
)

interface CoverPreviewFieldProps {
  form: ReturnType<typeof useForm<any>>
  viewId: string
  tableId: string
  updateView: (viewId: string, data: any) => void
  viewProperties: any
  namespace?: "gallery" | "kanban"
}

export const CoverPreviewField = ({
  form,
  viewId,
  tableId,
  updateView,
  viewProperties,
  namespace = "gallery",
}: CoverPreviewFieldProps) => {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const { t } = useTranslation()
  const { mblocks } = useAllMblocks()
  const fileFields = useFileFields()

  const coverPreviewItems = {
    content: [
      {
        value: null,
        label: t(`table.view.${namespace}.coverPreview.none`),
      },
      {
        value: "__CONTENT__",
        label: t(`table.view.${namespace}.coverPreview.content`),
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
    ].find((item) => item.value === form.watch("coverPreview"))?.label ||
    t(`table.view.${namespace}.coverPreview.none`)

  const handleItemClick = (value: string | null) => {
    form.setValue("coverPreview", value)
    setPopoverOpen(false)
    updateView(viewId, {
      properties: {
        ...viewProperties,
        coverPreview: value,
      },
    })
  }

  return (
    <FormField
      control={form.control}
      name="coverPreview"
      render={({ field }) => (
        <FormItem className="flex items-center justify-between rounded-md p-1 hover:bg-secondary">
          <FormLabel>{t(`table.view.${namespace}.coverPreview`)}</FormLabel>
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
                  <PreviewSection
                    items={coverPreviewItems.content}
                    handleItemClick={handleItemClick}
                  />
                  {coverPreviewItems.fields.length > 0 && (
                    <PreviewSection
                      items={coverPreviewItems.fields}
                      showDivider
                      handleItemClick={handleItemClick}
                    />
                  )}
                  {coverPreviewItems.mblocks.length > 0 && (
                    <PreviewSection
                      items={coverPreviewItems.mblocks}
                      showDivider
                      handleItemClick={handleItemClick}
                    />
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
