import type { MouseEvent } from "react"
import { type FC } from "react"
import { EyeIcon, EyeOffIcon, GripVerticalIcon } from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { cn } from "@/lib/utils"

import "./index.css"
import type { IField } from "@/packages/core/types/IField"
import { useTableStore } from "@/components/table/table-store-provider"

import { makeHeaderIcons } from "../fields/header-icons"

export interface CardProps {
  id: any
  text: string
  index: number
  isHidden: boolean
  field: IField
  onToggleHidden: (id: any) => void
}

const icons = makeHeaderIcons(14)

export const FieldItemCard: FC<CardProps> = ({
  id,
  text,
  index,
  isHidden,
  field,
  onToggleHidden,
}) => {
  const { setIsFieldPropertiesEditorOpen, setCurrentUiColumn } = useTableStore()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    // 确保拖拽时不会超出容器边界
    position: "relative" as const,
    zIndex: isDragging ? 1000 : "auto",
  }
  const handleToggleHidden = (e: MouseEvent, id: any) => {
    e.stopPropagation()
    if (id === "title") return
    onToggleHidden(id)
  }

  const handleFieldClick = () => {
    setIsFieldPropertiesEditorOpen(true)
    setCurrentUiColumn(field)
  }

  const iconSvgString = icons[field.type]({
    bgColor: "#aaa",
    fgColor: "currentColor",
  })

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-1.5 py-2 px-1.5 text-xs hover:bg-secondary min-w-0 rounded-sm"
    >
      <GripVerticalIcon
        className="cursor-grab opacity-0 group-hover:opacity-60 shrink-0"
        size={15}
        {...attributes}
        {...listeners}
      />
      <div
        className="flex w-full items-center justify-between min-w-0 gap-2 pr-1"
        onClick={handleFieldClick}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className="shrink-0 text-muted-foreground"
            dangerouslySetInnerHTML={{
              __html: iconSvgString,
            }}
          ></span>
          <span className="truncate">{text}</span>
        </div>
        <span
          onClick={(e) => handleToggleHidden(e, id)}
          className={cn(
            "cursor-pointer shrink-0 text-muted-foreground hover:text-foreground",
            {
              disabled: id === "title",
            }
          )}
        >
          {isHidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
        </span>
      </div>
    </div>
  )
}
