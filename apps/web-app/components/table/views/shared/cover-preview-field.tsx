import { useState } from "react"
import { BanIcon, FileText, ImageIcon, ToyBrickIcon } from "lucide-react"
import type { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
      return <FileText className="h-3.5 w-3.5" />
    if (item.type === "field") return <ImageIcon className="h-3.5 w-3.5" />
    if (item.type === "mblock") return <ToyBrickIcon className="h-3.5 w-3.5" />
    return <BanIcon className="h-3.5 w-3.5" />
  }

  return (
    <button
      onClick={() => handleItemClick(item.value)}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-accent/50 text-foreground w-full text-left"
    >
      {getIcon()}
      <span className="truncate">{item.label}</span>
    </button>
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
    {showDivider && <div className="my-1 border-t border-border" />}
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
    <div className="flex items-center justify-between py-1">
      <Label className="text-xs font-medium text-foreground">
        {t(`table.view.${namespace}.coverPreview`)}
      </Label>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className="h-7 text-xs max-w-[120px] truncate"
          >
            {displayCoverPreview}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-1 max-h-[280px] overflow-y-auto w-[200px]"
          align="end"
        >
          <div className="flex flex-col gap-0.5">
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
    </div>
  )
}
