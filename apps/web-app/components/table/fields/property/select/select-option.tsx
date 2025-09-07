import { useState } from "react"
import {
  SelectField,
  type SelectOption as ISelectOption,
} from "@/packages/core/fields/select"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash } from "lucide-react"
import { useTheme } from "next-themes"

import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ISelectOptionProps {
  option: ISelectOption
  container: HTMLDivElement | null
  onNameChange: (id: string, name: string) => void
  onDelete: (id: string) => void
  onColorChange: (id: string, color: string) => void
  children?: React.ReactNode
}
export const SelectOption = ({
  option,
  container,
  ...props
}: ISelectOptionProps) => {
  const [name, setName] = useState(option.name)
  const [open, setOpen] = useState(false)
  const { onNameChange, onDelete, onColorChange } = props
  const close = () => {
    setOpen(false)
  }

  const { theme } = useTheme()
  const handleColorChange = (e: any) => {
    onColorChange(option.id, e.target.dataset.color)
    e.stopPropagation()
    close()
  }
  const handleNameChange = () => {
    onNameChange(option.id, name)
  }
  const handleDelete = () => {
    onDelete(option.id)
  }

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: option.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: "100%",
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className="flex w-full items-center gap-0.5 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 overflow-hidden"
        >
          <button
            className="cursor-grab text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
          <div
            className="cursor-pointer rounded-sm px-[6px]"
            style={{
              background: `${SelectField.getColorValue(
                option.color,
                theme as any
              )}`,
            }}
          >
            {option.name}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" container={container ?? undefined}>
        <div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleNameChange()
                close()
              }
            }}
          />
          <div
            onClick={handleDelete}
            className="mt-4 flex cursor-pointer items-center gap-3 p-[6px] hover:bg-secondary"
          >
            <Trash className="h-4 w-4 opacity-60" /> Delete
          </div>
          <div className="flex flex-col">
            <span className="pl-1 opacity-60">colors</span>
            {SelectField.colors[theme as "light"].map((color) => (
              <div
                data-color={color.name}
                key={color.name}
                onClick={handleColorChange}
                className="flex cursor-pointer items-center gap-3 p-[6px] hover:bg-secondary"
              >
                <div
                  className="h-3 w-3"
                  style={{
                    background: `#${color.value}`,
                  }}
                ></div>{" "}
                {color.name}
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
