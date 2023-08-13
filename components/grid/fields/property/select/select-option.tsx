import { Trash } from "lucide-react"
import { useState } from "react"

import { Input } from "@/components/ui/input"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { SelectOption as ISelectOption, SelectField } from "@/lib/fields/select"

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex w-full py-1 hover:bg-gray-100">
          <div
            className="cursor-pointer rounded-sm px-[6px]"
            style={{
              background: `#${SelectField.colorNameValueMap[option.color]}`,
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
            {SelectField.colors.map((color) => (
              <div
                data-color={color.name}
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
