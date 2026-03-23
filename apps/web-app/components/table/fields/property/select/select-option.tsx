import { useState } from "react"
import {
  SelectField,
  type SelectOption as ISelectOption,
} from "@/packages/core/fields/select"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2 } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

interface ISelectOptionProps {
  option: ISelectOption
  container: HTMLDivElement | null
  onNameChange: (id: string, name: string) => void
  onDelete: (id: string) => void
  onColorChange: (id: string, color: string) => void
}

export const SelectOption = ({
  option,
  container,
  onNameChange,
  onDelete,
  onColorChange,
}: ISelectOptionProps) => {
  const { t } = useTranslation()
  const [name, setName] = useState(option.name)
  const [open, setOpen] = useState(false)
  const { resolvedTheme } = useTheme()

  const handleColorChange = (colorName: string) => {
    onColorChange(option.id, colorName)
    setOpen(false)
  }

  const handleNameChange = () => {
    if (name.trim() && name !== option.name) {
      onNameChange(option.id, name.trim())
    } else {
      setName(option.name)
    }
  }

  const handleDelete = () => {
    onDelete(option.id)
  }

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: option.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
    position: "relative" as const,
  }

  const colors = SelectField.colors[resolvedTheme as "light" | "dark"]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className={cn(
            "flex w-full items-center gap-1.5 px-1.5 py-1 rounded-md",
            "bg-background hover:bg-accent/50",
            "transition-colors duration-150",
            "cursor-pointer group"
          )}
        >
          {/* Drag Handle */}
          <div
            className={cn(
              "p-1 rounded shrink-0 cursor-grab active:cursor-grabbing",
              "text-muted-foreground/40 hover:text-muted-foreground/60",
              "hover:bg-muted/50 transition-colors"
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3" />
          </div>

          {/* Color Badge */}
          <div
            className="h-4 w-4 rounded shrink-0 ring-1 ring-border/50"
            style={{
              backgroundColor: `${SelectField.getColorValue(
                option.color,
                resolvedTheme as any
              )}`,
            }}
          />

          {/* Option Name */}
          <div className="flex-1 min-w-0">
            <span className="text-xs text-foreground truncate block">
              {option.name}
            </span>
          </div>
        </div>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="right"
        sideOffset={6}
        container={container ?? undefined}
        className="w-[220px] p-0"
      >
        <div className="p-2.5 space-y-2.5">
          {/* Name Edit Section */}
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("table.propertyEditor.select.optionName")}
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleNameChange()
                  setOpen(false)
                }
                if (e.key === "Escape") {
                  setName(option.name)
                  setOpen(false)
                }
              }}
              autoFocus
              className="h-7 text-xs"
              placeholder={t(
                "table.propertyEditor.select.optionNamePlaceholder"
              )}
            />
          </div>

          <Separator />

          {/* Color Selection */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("table.propertyEditor.select.color")}
            </Label>
            <div className="grid grid-cols-5 gap-1">
              {colors.map((color) => (
                <button
                  key={color.name}
                  onClick={() => handleColorChange(color.name)}
                  className={cn(
                    "group relative h-6 w-full rounded transition-all duration-150",
                    "hover:scale-105 focus:outline-hidden focus:ring-1 focus:ring-ring",
                    option.color === color.name && "ring-1.5 ring-foreground"
                  )}
                  style={{
                    backgroundColor: `#${color.value}`,
                  }}
                  title={color.name}
                >
                  {option.color === color.name && (
                    <svg
                      className="absolute inset-0 m-auto h-3 w-3 text-white drop-shadow-sm"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        stroke-linejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Delete Action */}
          <button
            onClick={handleDelete}
            className={cn(
              "w-full flex items-center justify-center gap-1.5",
              "px-2.5 py-1.5 rounded-md text-xs",
              "text-destructive hover:bg-destructive/10",
              "transition-colors duration-150"
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("table.propertyEditor.select.deleteOption")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
