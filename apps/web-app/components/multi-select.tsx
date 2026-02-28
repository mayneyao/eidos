"use client"

import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Option = { label: string; value: string }

interface ISelectProps {
  placeholder: string
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
}
export const MultiSelect = ({
  placeholder,
  options: values,
  selected: selectedItems,
  onChange: setSelectedItems,
}: ISelectProps) => {
  const handleSelectChange = (value: string) => {
    if (!selectedItems.includes(value)) {
      setSelectedItems([...selectedItems, value])
    } else {
      const referencedArray = [...selectedItems]
      const indexOfItemToBeRemoved = referencedArray.indexOf(value)
      referencedArray.splice(indexOfItemToBeRemoved, 1)
      setSelectedItems(referencedArray)
    }
  }

  const isOptionSelected = (value: string): boolean => {
    return selectedItems.includes(value) ? true : false
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="w-full">
          <Button
            variant="outline"
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {selectedItems.map((item) => (
                <div
                  key={item}
                  className="rounded-full bg-primary px-2 py-1 text-sm font-medium text-primary-foreground"
                >
                  {values.find((o) => o.value === item)?.label}
                </div>
              ))}
            </div>
            {!selectedItems.length && (
              <div className="text-xs text-muted-foreground">{placeholder}</div>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 overflow-y-auto max-h-[300px]"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {values.map((value: ISelectProps["options"][0], index: number) => {
            return (
              <DropdownMenuCheckboxItem
                onSelect={(e) => e.preventDefault()}
                key={index}
                checked={isOptionSelected(value.value)}
                onCheckedChange={() => handleSelectChange(value.value)}
              >
                {value.label}
              </DropdownMenuCheckboxItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export default MultiSelect
